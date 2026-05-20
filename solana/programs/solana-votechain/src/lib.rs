use anchor_lang::prelude::*;

declare_id!("3JPAz1W52SL3fzdyXYALKWJLuoCsVtCcZAs5r3TAjoJW");

/// Max proposals (fixed array for account size).
pub const MAX_PROPOSALS: usize = 8;
/// Max eligible commitments and nullifiers (keep account small for BPF stack).
pub const MAX_ELIGIBLE: usize = 8;

#[program]
pub mod solana_votechain {
    use super::*;

    pub fn init_ballot(
        ctx: Context<InitBallot>,
        start_ts: i64,
        end_ts: i64,
        proposal_count: u8,
    ) -> Result<()> {
        require!(
            proposal_count >= 2 && proposal_count <= MAX_PROPOSALS as u8,
            VotechainError::BadProposalCount
        );
        require!(end_ts > start_ts, VotechainError::BadTimes);

        let b = &mut ctx.accounts.ballot;
        b.admin = ctx.accounts.admin.key();
        b.relayer = ctx.accounts.relayer.key();
        b.bump = ctx.bumps.ballot;
        b.start_ts = start_ts;
        b.end_ts = end_ts;
        b.proposal_count = proposal_count;
        b.proposal_votes = [0u64; MAX_PROPOSALS];
        b.eligible_len = 0;
        b.eligible = [[0u8; 32]; MAX_ELIGIBLE];
        b.nullifiers_len = 0;
        b.nullifiers = [[0u8; 32]; MAX_ELIGIBLE];
        Ok(())
    }

    /// Registry admin adds an eligible commitment (bytes32-style identity).
    pub fn add_eligible(ctx: Context<ManageBallot>, commitment: [u8; 32]) -> Result<()> {
        require!(commitment != [0u8; 32], VotechainError::BadCommitment);
        let b = &mut ctx.accounts.ballot;
        let i = b.eligible_len as usize;
        require!(i < MAX_ELIGIBLE, VotechainError::RegistryFull);
        for j in 0..i {
            require!(b.eligible[j] != commitment, VotechainError::DuplicateEligible);
        }
        b.eligible[i] = commitment;
        b.eligible_len += 1;
        Ok(())
    }

    /// Ballot admin can move start time to now if voting has not ended.
    pub fn start_voting_now(ctx: Context<ManageBallot>) -> Result<()> {
        let b = &mut ctx.accounts.ballot;
        let now = Clock::get()?.unix_timestamp;
        require!(now <= b.end_ts, VotechainError::Ended);
        if now < b.start_ts {
            b.start_ts = now;
        }
        Ok(())
    }

    /// Relayer submits vote: commitment must be whitelisted; nullifier hides wallet link on-chain.
    pub fn vote(
        ctx: Context<RelayVote>,
        proposal_id: u8,
        commitment: [u8; 32],
        nullifier: [u8; 32],
    ) -> Result<()> {
        require!(commitment != [0u8; 32], VotechainError::BadCommitment);
        require!(nullifier != [0u8; 32], VotechainError::BadNullifier);
        let ballot = &mut ctx.accounts.ballot;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= ballot.start_ts, VotechainError::NotStarted);
        require!(now <= ballot.end_ts, VotechainError::Ended);
        require!(
            proposal_id < ballot.proposal_count,
            VotechainError::BadProposal
        );

        let n_elig = ballot.eligible_len as usize;
        let mut eligible = false;
        for j in 0..n_elig {
            if ballot.eligible[j] == commitment {
                eligible = true;
                break;
            }
        }
        require!(eligible, VotechainError::NotEligible);

        let n_null = ballot.nullifiers_len as usize;
        for j in 0..n_null {
            require!(ballot.nullifiers[j] != nullifier, VotechainError::AlreadyVoted);
        }
        require!(n_null < MAX_ELIGIBLE, VotechainError::NullifierTableFull);

        ballot.nullifiers[n_null] = nullifier;
        ballot.nullifiers_len += 1;

        let idx = proposal_id as usize;
        ballot.proposal_votes[idx] = ballot.proposal_votes[idx]
            .checked_add(1)
            .ok_or(VotechainError::Overflow)?;

        emit!(VoteCast {
            nullifier,
            proposal_id: proposal_id as u16,
        });
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Ballot {
    pub admin: Pubkey,
    pub relayer: Pubkey,
    pub bump: u8,
    pub start_ts: i64,
    pub end_ts: i64,
    pub proposal_count: u8,
    pub proposal_votes: [u64; MAX_PROPOSALS],
    pub eligible_len: u16,
    pub eligible: [[u8; 32]; MAX_ELIGIBLE],
    pub nullifiers_len: u16,
    pub nullifiers: [[u8; 32]; MAX_ELIGIBLE],
}

#[derive(Accounts)]
pub struct InitBallot<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: The backend relayer public key
    pub relayer: UncheckedAccount<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Ballot::INIT_SPACE,
        seeds = [b"ballot", admin.key().as_ref()],
        bump
    )]
    pub ballot: Account<'info, Ballot>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageBallot<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"ballot", admin.key().as_ref()],
        bump = ballot.bump,
        has_one = admin
    )]
    pub ballot: Account<'info, Ballot>,
}

#[derive(Accounts)]
pub struct RelayVote<'info> {
    #[account(mut)]
    pub relayer: Signer<'info>,
    #[account(
        mut,
        has_one = relayer
    )]
    pub ballot: Account<'info, Ballot>,
}

#[derive(Accounts)]
pub struct VoteIx<'info> {
    #[account(mut)]
    pub ballot: Account<'info, Ballot>,
}

#[event]
pub struct VoteCast {
    pub nullifier: [u8; 32],
    pub proposal_id: u16,
}

#[error_code]
pub enum VotechainError {
    #[msg("Need 2..=8 proposals")]
    BadProposalCount,
    #[msg("end_ts must be after start_ts")]
    BadTimes,
    #[msg("Invalid commitment")]
    BadCommitment,
    #[msg("Registry full")]
    RegistryFull,
    #[msg("Commitment already eligible")]
    DuplicateEligible,
    #[msg("Voting not started")]
    NotStarted,
    #[msg("Voting ended")]
    Ended,
    #[msg("Invalid proposal")]
    BadProposal,
    #[msg("Commitment not eligible")]
    NotEligible,
    #[msg("Nullifier already used")]
    AlreadyVoted,
    #[msg("Nullifier table full")]
    NullifierTableFull,
    #[msg("Invalid nullifier")]
    BadNullifier,
    #[msg("Vote count overflow")]
    Overflow,
}

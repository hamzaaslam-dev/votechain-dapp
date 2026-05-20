import anchor from "@coral-xyz/anchor";
const { Program } = anchor;
import { createHash } from "crypto";
import * as fs from "fs";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

const idl = JSON.parse(fs.readFileSync("idl/solana_votechain.json", "utf8"));

export function identityFromSeed(seed: string): { commitment: number[]; nullifier: number[] } {
  const sig = createHash("sha256").update(seed).digest();
  const commitment = createHash("sha256").update(sig).digest();
  const nullifier = createHash("sha256")
    .update(Buffer.concat([sig, Buffer.from(":nullifier:sol:v1", "utf8")]))
    .digest();
  return {
    commitment: Array.from(commitment),
    nullifier: Array.from(nullifier)
  };
}

function ballotPda(programId: PublicKey, admin: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ballot"), admin.toBuffer()],
    programId
  );
  return pda;
}

async function fund(connection: anchor.web3.Connection, kp: Keypair) {
  const sig = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

describe("solana-votechain", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl as anchor.Idl, provider);

  it("init ballot, add eligible, vote once, reject double vote", async () => {
    const admin = Keypair.generate();
    await fund(provider.connection, admin);
    const ballot = ballotPda(program.programId, admin.publicKey);

    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .initBallot(new anchor.BN(now - 10), new anchor.BN(now + 3600), 2)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        relayer: admin.publicKey,
        ballot,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .signers([admin])
      .rpc();

    const { commitment, nullifier } = identityFromSeed("voter-one");
    await program.methods
      .addEligible(commitment)
      .accounts({ admin: admin.publicKey, ballot })
      .signers([admin])
      .rpc();

    await program.methods
      .vote(0, commitment, nullifier)
      .accounts({ relayer: admin.publicKey, ballot })
      .signers([admin])
      .rpc();

    const acct = await program.account.ballot.fetch(ballot);
    expect(acct.proposalVotes[0].toNumber()).to.equal(1);

    let doubleVoteFailed = false;
    try {
      await program.methods.vote(0, commitment, nullifier).accounts({ relayer: admin.publicKey, ballot }).signers([admin]).rpc();
    } catch {
      doubleVoteFailed = true;
    }
    expect(doubleVoteFailed).to.equal(true);
  });

  it("start_voting_now opens early election", async () => {
    const admin = Keypair.generate();
    await fund(provider.connection, admin);
    const ballot = ballotPda(program.programId, admin.publicKey);

    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .initBallot(new anchor.BN(now + 3600), new anchor.BN(now + 7200), 2)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        relayer: admin.publicKey,
        ballot,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .signers([admin])
      .rpc();

    const { commitment, nullifier } = identityFromSeed("voter-two");
    await program.methods
      .addEligible(commitment)
      .accounts({ admin: admin.publicKey, ballot })
      .signers([admin])
      .rpc();

    let doubleVoteFailed = false;
    try {
      await program.methods.vote(0, commitment, nullifier).accounts({ relayer: admin.publicKey, ballot }).signers([admin]).rpc();
    } catch {
      doubleVoteFailed = true;
    }
    expect(doubleVoteFailed).to.equal(true);

    await program.methods
      .startVotingNow()
      .accounts({ admin: admin.publicKey, ballot })
      .signers([admin])
      .rpc();

    await program.methods.vote(0, commitment, nullifier).accounts({ relayer: admin.publicKey, ballot }).signers([admin]).rpc();
    const acct = await program.account.ballot.fetch(ballot);
    expect(acct.proposalVotes[0].toNumber()).to.equal(1);
  });
});

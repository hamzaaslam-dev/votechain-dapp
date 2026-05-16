/**
 * Demo: derive identity from seed, add eligible, cast vote (localnet or devnet).
 *   cd solana && anchor test   # local
 *   CLUSTER=devnet npx ts-node scripts/demo-vote.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { PublicKey } from "@solana/web3.js";
import { SolanaVotechain } from "../target/types/solana_votechain";
import { identityFromSeed } from "../tests/solana-votechain";

function ballotPda(programId: PublicKey, admin: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ballot"), admin.toBuffer()],
    programId
  );
  return pda;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SolanaVotechain as Program<SolanaVotechain>;
  const admin = (provider.wallet as anchor.Wallet).payer;
  const ballot = ballotPda(program.programId, admin.publicKey);
  const seed = process.env.VOTER_SEED || "demo-voter-1";
  const { commitment, nullifier } = identityFromSeed(seed);
  const proposalId = Number(process.env.PROPOSAL_ID || "0");

  try {
    await program.methods.addEligible(commitment).accounts({ admin: admin.publicKey, ballot } as never).rpc();
    console.log("add_eligible ok");
  } catch (e) {
    console.log("add_eligible skipped (maybe exists):", (e as Error).message);
  }

  const sig = await program.methods
    .vote(proposalId, commitment, nullifier)
    .accounts({ ballot })
    .rpc();
  console.log("vote tx:", sig);

  const acct = await program.account.ballot.fetch(ballot);
  console.log(
    "votes:",
    acct.proposalVotes.slice(0, acct.proposalCount).map((v) => v.toString())
  );

  const deployPath = path.join(__dirname, "../target/deployed-devnet.json");
  if (fs.existsSync(deployPath)) {
    console.log("deploy info:", fs.readFileSync(deployPath, "utf8"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

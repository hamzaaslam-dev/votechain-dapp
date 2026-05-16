/**
 * Deploy program to devnet and init a demo ballot. Writes target/deployed-devnet.json
 *
 *   cd solana && anchor build && anchor deploy --provider.cluster devnet
 *   npx ts-node scripts/deploy-devnet.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { PublicKey } from "@solana/web3.js";
import { SolanaVotechain } from "../target/types/solana_votechain";

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

  const relayerKeyPath = path.join(__dirname, "../..", ".admin-solana-keypair.json");
  let relayerPubkey = admin.publicKey; // default fallback
  if (fs.existsSync(relayerKeyPath)) {
      const secret = JSON.parse(fs.readFileSync(relayerKeyPath, "utf8"));
      const keypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(secret));
      relayerPubkey = keypair.publicKey;
  } else {
      console.warn("No relayer key found at .admin-solana-keypair.json, using admin as relayer.");
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    await program.account.ballot.fetch(ballot);
    console.log("Ballot already exists:", ballot.toBase58());
  } catch {
    const sig = await program.methods
      .initBallot(new anchor.BN(now - 10), new anchor.BN(now + 86400 * 7), 3)
      .accounts({ admin: admin.publicKey, relayer: relayerPubkey, ballot } as never)
      .rpc();
    console.log("init_ballot tx:", sig);
  }

  const out = {
    cluster: "devnet",
    programId: program.programId.toBase58(),
    ballot: ballot.toBase58(),
    admin: admin.publicKey.toBase58(),
    proposalCount: 3
  };
  const outPath = path.join(__dirname, "../target/deployed-devnet.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote", outPath);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

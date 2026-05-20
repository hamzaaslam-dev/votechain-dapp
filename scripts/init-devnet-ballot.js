/**
 * One-off: init ballot on devnet and write public/solana-deployed.json
 * Usage: node scripts/init-devnet-ballot.js
 */
const fs = require("fs");
const path = require("path");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction
} = require("@solana/web3.js");

const PROGRAM_ID = new PublicKey("3JPAz1W52SL3fzdyXYALKWJLuoCsVtCcZAs5r3TAjoJW");
const RPC = "https://api.devnet.solana.com";
const INIT_DISC = Buffer.from([132, 244, 135, 124, 27, 222, 231, 0]);

function loadKeypair(filePath) {
  const secret = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function ballotPda(admin) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ballot"), admin.toBuffer()],
    PROGRAM_ID
  )[0];
}

function encodeInitArgs(startTs, endTs, proposalCount) {
  const buf = Buffer.alloc(17);
  buf.writeBigInt64LE(BigInt(startTs), 0);
  buf.writeBigInt64LE(BigInt(endTs), 8);
  buf.writeUInt8(proposalCount, 16);
  return buf;
}

async function main() {
  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || "", ".config/solana/id.json");
  const admin = loadKeypair(walletPath); // payer
  const adminPk = new PublicKey("2DyPEBfRtipfap7jzATXxsCLm6oLq3r6kXVLyyVjmxLB");
  const relayerPath = path.join(__dirname, "..", ".admin-solana-keypair.json");
  const relayer = fs.existsSync(relayerPath)
    ? loadKeypair(relayerPath)
    : admin;

  const ballot = ballotPda(adminPk);
  const connection = new Connection(RPC, "confirmed");
  const existing = await connection.getAccountInfo(ballot);
  if (!existing) {
    const now = Math.floor(Date.now() / 1000);
    const data = Buffer.concat([
      INIT_DISC,
      encodeInitArgs(now - 10, now + 86400 * 7, 3)
    ]);
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true }, // payer
        { pubkey: adminPk, isSigner: false, isWritable: false }, // admin
        { pubkey: relayer.publicKey, isSigner: false, isWritable: false }, // relayer
        { pubkey: ballot, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId: PROGRAM_ID,
      data
    });
    const tx = new Transaction().add(ix);
    const sig = await connection.sendTransaction(tx, [admin]);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("init_ballot tx:", sig);
  } else {
    console.log("Ballot already exists:", ballot.toBase58());
  }

  const out = {
    cluster: "devnet",
    programId: PROGRAM_ID.toBase58(),
    ballot: ballot.toBase58(),
    admin: adminPk.toBase58(),
    relayer: relayer.publicKey.toBase58(),
    proposalCount: 3
  };
  const outPath = path.join(__dirname, "..", "public", "solana-deployed.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote", outPath);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

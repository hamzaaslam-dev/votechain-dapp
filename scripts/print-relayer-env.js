/**
 * Print RELAYER_KEYPAIR_JSON for Vercel + relayer address to fund.
 * Usage: node scripts/print-relayer-env.js
 */
const fs = require("fs");
const path = require("path");
const { Keypair } = require("@solana/web3.js");

const KEY_FILE = path.join(__dirname, "..", ".admin-solana-keypair.json");
const DEPLOYED = path.join(__dirname, "..", "public", "solana-deployed.json");

if (!fs.existsSync(KEY_FILE)) {
  console.error("Missing .admin-solana-keypair.json");
  process.exit(1);
}

const secret = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
const kp = Keypair.fromSecretKey(Uint8Array.from(secret));
const deployed = fs.existsSync(DEPLOYED) ? JSON.parse(fs.readFileSync(DEPLOYED, "utf8")) : {};

console.log("Relayer address (fund on devnet):");
console.log(kp.publicKey.toBase58());
if (deployed.relayer && deployed.relayer !== kp.publicKey.toBase58()) {
  console.warn("WARNING: does not match solana-deployed.json relayer:", deployed.relayer);
}
console.log("\nVercel env — Name: RELAYER_KEYPAIR_JSON");
console.log("Value (paste as one line):");
console.log(JSON.stringify(secret));

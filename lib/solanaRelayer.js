const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const CONNECTION_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DEPLOYED_PATH = path.join(__dirname, "..", "public", "solana-deployed.json");
const RELAYER_KEY_PATH = path.join(__dirname, "..", ".admin-solana-keypair.json");
const VOTE_DISC = Buffer.from([227, 110, 155, 23, 136, 126, 172, 25]);

let connection = null;
let relayerKeypair = null;

function loadDeployed() {
  if (!fs.existsSync(DEPLOYED_PATH)) {
    throw new Error("Smart contract not deployed yet (solana-deployed.json missing)");
  }
  const deployed = JSON.parse(fs.readFileSync(DEPLOYED_PATH, "utf8"));
  if (!deployed.ballot || !deployed.programId) {
    throw new Error("Invalid deployment data in solana-deployed.json");
  }
  return deployed;
}

function keypairFromSecretArray(secret) {
  const bytes = Uint8Array.from(secret);
  return Keypair.fromSecretKey(bytes);
}

function loadRelayerKeypairFromEnv() {
  const raw = process.env.RELAYER_KEYPAIR_JSON;
  if (!raw) return null;
  return keypairFromSecretArray(JSON.parse(raw));
}

function loadRelayerKeypairFromFile() {
  if (!fs.existsSync(RELAYER_KEY_PATH)) return null;
  return keypairFromSecretArray(JSON.parse(fs.readFileSync(RELAYER_KEY_PATH, "utf8")));
}

function getRelayerKeypair() {
  if (relayerKeypair) return relayerKeypair;

  const deployed = loadDeployed();
  const expectedRelayer = deployed.relayer ? new PublicKey(deployed.relayer) : null;

  const kp = loadRelayerKeypairFromEnv() || loadRelayerKeypairFromFile();
  if (!kp) {
    const hint = expectedRelayer ? expectedRelayer.toBase58() : "see solana-deployed.json";
    throw new Error(
      `Relayer keypair not configured. Set RELAYER_KEYPAIR_JSON in Vercel or add .admin-solana-keypair.json. Fund ${hint} on devnet.`
    );
  }
  if (expectedRelayer && !kp.publicKey.equals(expectedRelayer)) {
    throw new Error(
      `Relayer key mismatch: key is ${kp.publicKey.toBase58()}, expected ${expectedRelayer.toBase58()}`
    );
  }

  relayerKeypair = kp;
  return relayerKeypair;
}

function hexToBuf32(hex) {
  const h = String(hex).replace(/^0x/, "");
  if (h.length !== 64) throw new Error("Expected 32-byte hex");
  return Buffer.from(h, "hex");
}

async function ensureRelayerFunded(relayer, conn) {
  const lamports = await conn.getBalance(relayer.publicKey);
  if (lamports < 5000) {
    throw new Error(
      `Relayer needs devnet SOL: solana airdrop 2 ${relayer.publicKey.toBase58()} --url devnet`
    );
  }
}

async function relayVote(proposalId, commitmentHex, nullifierHex) {
  if (!connection) connection = new Connection(CONNECTION_URL, "confirmed");
  const relayer = getRelayerKeypair();
  await ensureRelayerFunded(relayer, connection);

  const deployed = loadDeployed();
  const programId = new PublicKey(deployed.programId);
  const ballotPk = new PublicKey(deployed.ballot);

  const commitment = hexToBuf32(commitmentHex);
  const nullifier = hexToBuf32(nullifierHex);

  const data = Buffer.alloc(8 + 1 + 32 + 32);
  VOTE_DISC.copy(data, 0);
  data.writeUInt8(proposalId, 8);
  commitment.copy(data, 9);
  nullifier.copy(data, 41);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: relayer.publicKey, isSigner: true, isWritable: true },
      { pubkey: ballotPk, isSigner: false, isWritable: true }
    ],
    programId,
    data
  });

  const tx = new Transaction().add(ix);
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = relayer.publicKey;
  tx.sign(relayer);

  try {
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    return signature;
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("no record of a prior credit") || msg.includes("insufficient")) {
      throw new Error(
        `Relayer ${relayer.publicKey.toBase58()} needs devnet SOL. ` +
          `solana airdrop 2 ${relayer.publicKey.toBase58()} --url devnet`
      );
    }
    if (msg.includes("NotEligible") || msg.includes("0x1773")) {
      throw new Error("Wallet not whitelisted on-chain — admin must Approve (Phantom tx) first");
    }
    throw e;
  }
}

module.exports = { relayVote, getRelayerKeypair, loadDeployed };

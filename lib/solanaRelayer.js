const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const CONNECTION_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DEPLOYED_PATH = path.join(__dirname, "..", "public", "solana-deployed.json");
const RELAYER_KEY_PATH = path.join(__dirname, "..", ".admin-solana-keypair.json");

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
  if (bytes.length !== 64) {
    throw new Error("Relayer keypair must be a JSON array of 64 bytes");
  }
  return Keypair.fromSecretKey(bytes);
}

function loadRelayerKeypairFromEnv() {
  const raw = process.env.RELAYER_KEYPAIR_JSON;
  if (!raw) return null;
  try {
    return keypairFromSecretArray(JSON.parse(raw));
  } catch (e) {
    throw new Error("Invalid RELAYER_KEYPAIR_JSON: " + e.message);
  }
}

function loadRelayerKeypairFromFile() {
  if (!fs.existsSync(RELAYER_KEY_PATH)) return null;
  const secret = JSON.parse(fs.readFileSync(RELAYER_KEY_PATH, "utf8"));
  return keypairFromSecretArray(secret);
}

function getRelayerKeypair() {
  if (relayerKeypair) return relayerKeypair;

  const deployed = loadDeployed();
  const expectedRelayer = deployed.relayer
    ? new PublicKey(deployed.relayer)
    : null;

  const fromEnv = loadRelayerKeypairFromEnv();
  const fromFile = loadRelayerKeypairFromFile();
  const kp = fromEnv || fromFile;

  if (!kp) {
    const hint = expectedRelayer
      ? expectedRelayer.toBase58()
      : "(see public/solana-deployed.json → relayer)";
    throw new Error(
      `Relayer keypair not configured. Add RELAYER_KEYPAIR_JSON to Vercel env ` +
        `(contents of .admin-solana-keypair.json), then fund ${hint} on devnet.`
    );
  }

  if (expectedRelayer && !kp.publicKey.equals(expectedRelayer)) {
    throw new Error(
      `Relayer key mismatch: keypair is ${kp.publicKey.toBase58()} but ` +
        `solana-deployed.json expects ${expectedRelayer.toBase58()}`
    );
  }

  relayerKeypair = kp;
  return relayerKeypair;
}

async function ensureRelayerFunded(relayer, connection) {
  const lamports = await connection.getBalance(relayer.publicKey);
  if (lamports < 5000) {
    throw new Error(
      `Relayer wallet has no devnet SOL. Fund this address:\n` +
        `${relayer.publicKey.toBase58()}\n` +
        `Run: solana airdrop 2 ${relayer.publicKey.toBase58()} --url devnet`
    );
  }
}

async function relayVote(votingTokenHex, proposalId) {
  if (!connection) connection = new Connection(CONNECTION_URL, "confirmed");
  const relayer = getRelayerKeypair();
  await ensureRelayerFunded(relayer, connection);

  const deployed = loadDeployed();
  const programId = new PublicKey(deployed.programId);
  const ballotPk = new PublicKey(deployed.ballot);

  const voteDisc = Buffer.from([227, 110, 155, 23, 136, 126, 172, 25]);
  const tokenBuffer = Buffer.from(votingTokenHex, "hex");
  if (tokenBuffer.length !== 32) {
    throw new Error("Voting token must be 64 hex characters (32 bytes)");
  }

  const data = Buffer.alloc(8 + 1 + 32);
  voteDisc.copy(data, 0);
  data.writeUInt8(proposalId, 8);
  tokenBuffer.copy(data, 9);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: relayer.publicKey, isSigner: true, isWritable: true },
      { pubkey: ballotPk, isSigner: false, isWritable: true }
    ],
    programId,
    data
  });

  const tx = new Transaction().add(ix);
  const latestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = latestBlockhash.blockhash;
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
          `Run: solana airdrop 2 ${relayer.publicKey.toBase58()} --url devnet`
      );
    }
    throw e;
  }
}

module.exports = {
  relayVote,
  getRelayerKeypair,
  loadDeployed
};

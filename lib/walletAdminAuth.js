const { Connection, PublicKey } = require("@solana/web3.js");
const nacl = require("tweetnacl");

function parseAdminSessionMessage(message) {
  const lines = String(message || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines[0] !== "VoteChain admin session") return null;
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(":");
    if (idx === -1) continue;
    out[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
  }
  return out;
}

function readBallotAdmin(connection, ballotAddress) {
  return connection.getAccountInfo(new PublicKey(ballotAddress)).then((info) => {
    if (!info?.data || info.data.length < 40) return null;
    return new PublicKey(info.data.subarray(8, 40));
  });
}

/**
 * Verifies Phantom signMessage (UTF-8 bytes) and on-chain Ballot.admin.
 */
async function verifyBallotAdminSession(ballotAddress, message, signatureBase64, walletBase58) {
  if (!ballotAddress) {
    return { ok: false, error: "Missing ballot address" };
  }
  let ballotPk;
  let walletPk;
  try {
    ballotPk = new PublicKey(ballotAddress);
    walletPk = new PublicKey(walletBase58);
  } catch {
    return { ok: false, error: "Invalid Solana address" };
  }
  if (!message || !signatureBase64) {
    return { ok: false, error: "Missing wallet signature" };
  }

  const parsed = parseAdminSessionMessage(message);
  if (!parsed || !parsed.Ballot || !parsed.Wallet || !parsed.Expires) {
    return { ok: false, error: "Invalid session message" };
  }
  if (parsed.Ballot !== ballotPk.toBase58()) {
    return { ok: false, error: "Message ballot does not match request" };
  }
  if (parsed.Wallet !== walletPk.toBase58()) {
    return { ok: false, error: "Signer does not match message wallet" };
  }

  const exp = Number(parsed.Expires);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "Session expired — sign again" };
  }

  let sig;
  try {
    sig = Buffer.from(signatureBase64, "base64");
  } catch {
    return { ok: false, error: "Invalid signature encoding" };
  }
  if (sig.length !== 64) {
    return { ok: false, error: "Invalid signature length" };
  }

  const msgBytes = Buffer.from(message, "utf8");
  const ok = nacl.sign.detached.verify(msgBytes, sig, walletPk.toBytes());
  if (!ok) {
    return { ok: false, error: "Signature verification failed" };
  }

  let allowedAdmin = "2DyPEBfRtipfap7jzATXxsCLm6oLq3r6kXVLyyVjmxLB"; // fallback
  try {
    const path = require("path");
    const fs = require("fs");
    const deployedPath = path.join(__dirname, "..", "public", "solana-deployed.json");
    if (fs.existsSync(deployedPath)) {
      const deployed = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
      if (deployed.admin) {
        allowedAdmin = deployed.admin;
      }
    }
  } catch (e) {
    console.warn("[walletAdminAuth] Failed to load admin from solana-deployed.json:", e.message);
  }

  // If connected wallet doesn't match solana-deployed.json, check on-chain admin directly
  if (walletPk.toBase58() !== allowedAdmin) {
    try {
      const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
      const connection = new Connection(RPC, "confirmed");
      const onChainAdmin = await readBallotAdmin(connection, ballotAddress);
      if (onChainAdmin) {
        allowedAdmin = onChainAdmin.toBase58();
      }
    } catch (e) {
      console.warn("[walletAdminAuth] Failed to load admin from on-chain ballot:", e.message);
    }
  }

  if (walletPk.toBase58() !== allowedAdmin) {
    return { ok: false, error: "Connected wallet is not ballot admin" };
  }

  return { ok: true, wallet: walletPk.toBase58() };
}

module.exports = {
  verifyBallotAdminSession,
  parseAdminSessionMessage
};

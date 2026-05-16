/** Browser helpers — must match lib/solanaVotingIdentity.js */
const SOLANA_VOTE_SIGN_MESSAGE = new TextEncoder().encode(
  "VoteChain:solana:v1:wallet-derived-voting-identity"
);
// Phantom expects Uint8Array

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

async function commitmentFromSignature(signature) {
  return sha256(signature);
}

async function nullifierFromSignature(signature) {
  const suffix = new TextEncoder().encode(":nullifier:sol:v1");
  const combined = new Uint8Array(signature.length + suffix.length);
  combined.set(signature, 0);
  combined.set(suffix, signature.length);
  return sha256(combined);
}

function bytesToHex32(u8) {
  return (
    "0x" +
    Array.from(u8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

function hexToBytes32Array(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length !== 64) throw new Error("expected 32-byte hex");
  const out = [];
  for (let i = 0; i < 64; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
}

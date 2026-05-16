const crypto = require("crypto");

/** Must match solana/scripts/identity.ts and public/solana-identity.js */
const VOTE_SIGN_MESSAGE = Buffer.from(
  "VoteChain:solana:v1:wallet-derived-voting-identity",
  "utf8"
);

function commitmentFromSignature(signature) {
  return crypto.createHash("sha256").update(signature).digest();
}

function nullifierFromSignature(signature) {
  return crypto
    .createHash("sha256")
    .update(Buffer.concat([Buffer.from(signature), Buffer.from(":nullifier:sol:v1", "utf8")]))
    .digest();
}

function hexBytes32(buf) {
  return "0x" + buf.toString("hex");
}

module.exports = {
  VOTE_SIGN_MESSAGE,
  commitmentFromSignature,
  nullifierFromSignature,
  hexBytes32
};

const crypto = require("crypto");

function isValidVotingToken(token) {
  return /^[0-9a-f]{64}$/i.test(String(token || "").trim());
}

function hashVotingToken(token) {
  return crypto.createHash("sha256").update(String(token).trim().toLowerCase(), "utf8").digest("hex");
}

module.exports = { isValidVotingToken, hashVotingToken };

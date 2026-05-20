const { PublicKey } = require("@solana/web3.js");
const nacl = require("tweetnacl");
const {
  commitmentFromSignature,
  nullifierFromSignature,
  hexBytes32
} = require("./solanaVotingIdentity");

function buildWhitelistMessage(cnic, walletBase58) {
  return `VoteChain:whitelist\nCNIC:${cnic}\nWallet:${walletBase58}`;
}

function buildVoteMessage(walletBase58, proposalId) {
  return `VoteChain:vote\nWallet:${walletBase58}\nProposal:${proposalId}`;
}

function verifyWalletMessage(message, signatureBase64, walletBase58) {
  let walletPk;
  try {
    walletPk = new PublicKey(walletBase58);
  } catch {
    return { ok: false, error: "Invalid wallet address" };
  }

  let sig;
  try {
    sig = Buffer.from(signatureBase64, "base64");
  } catch {
    return { ok: false, error: "Invalid signature encoding" };
  }

  const msgBytes = Buffer.from(message, "utf8");
  const ok = nacl.sign.detached.verify(msgBytes, sig, walletPk.toBytes());
  if (!ok) return { ok: false, error: "Wallet signature verification failed" };

  return { ok: true, signatureBytes: sig };
}

function commitmentHexFromRegisterSig(signatureBase64, message, walletBase58) {
  const v = verifyWalletMessage(message, signatureBase64, walletBase58);
  if (!v.ok) return v;
  return { ok: true, commitmentHex: hexBytes32(commitmentFromSignature(v.signatureBytes)) };
}

function nullifierHexFromVoteSig(signatureBase64, message, walletBase58) {
  const v = verifyWalletMessage(message, signatureBase64, walletBase58);
  if (!v.ok) return v;
  return { ok: true, nullifierHex: hexBytes32(nullifierFromSignature(v.signatureBytes)) };
}

module.exports = {
  buildWhitelistMessage,
  buildVoteMessage,
  verifyWalletMessage,
  commitmentHexFromRegisterSig,
  nullifierHexFromVoteSig
};

const { ethers } = require("ethers");

/** Must match `public/shared-config.js` and browser `signMessage` input exactly. */
const VOTE_CHAIN_IDENTITY_MESSAGE = "VoteChain:v2:wallet-derived-voting-identity";

function commitmentFromSignature(signature) {
  return ethers.keccak256(signature);
}

function nullifierFromSignature(signature) {
  return ethers.keccak256(
    ethers.concat([ethers.getBytes(signature), ethers.toUtf8Bytes(":nullifier:v2")])
  );
}

module.exports = {
  VOTE_CHAIN_IDENTITY_MESSAGE,
  commitmentFromSignature,
  nullifierFromSignature
};

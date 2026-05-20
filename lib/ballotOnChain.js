const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

/** Parse Ballot account: eligible commitments after anchor discriminator (8 bytes). */
function parseEligibleCommitments(data) {
  if (!data || data.length < 8 + 32 + 32 + 1 + 8 + 8 + 1 + 64 + 2) {
    return [];
  }
  let o = 8; // skip discriminator
  o += 32 + 32 + 1 + 8 + 8 + 1; // admin, relayer, bump, times, proposal_count
  o += 64; // proposal_votes
  const eligibleLen = data.readUInt16LE(o);
  o += 2;
  const out = [];
  for (let i = 0; i < eligibleLen && o + 32 <= data.length; i++) {
    out.push(Buffer.from(data.subarray(o, o + 32)));
    o += 32;
  }
  return out;
}

async function isCommitmentEligible(ballotAddress, commitmentHex) {
  const conn = new Connection(RPC, "confirmed");
  const info = await conn.getAccountInfo(new PublicKey(ballotAddress));
  if (!info?.data) return false;
  const want = Buffer.from(commitmentHex.replace(/^0x/, ""), "hex");
  const eligible = parseEligibleCommitments(info.data);
  return eligible.some((b) => b.equals(want));
}

module.exports = { isCommitmentEligible, parseEligibleCommitments };

const fs = require("fs");
const path = require("path");
const store = require("../lib/applicationStore");
const solanaRelayer = require("../lib/solanaRelayer");
const { isCommitmentEligible } = require("../lib/ballotOnChain");
const {
  buildWhitelistMessage,
  buildVoteMessage,
  commitmentHexFromRegisterSig,
  nullifierHexFromVoteSig
} = require("../lib/walletVoterAuth");

function parseJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return {};
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    const body = parseJsonBody(req);
    const wallet = String(body.wallet || "").trim();
    const registerMessage = String(body.registerMessage || "");
    const registerSignature = String(body.registerSignature || "");
    const voteMessage = String(body.voteMessage || "");
    const voteSignature = String(body.voteSignature || "");
    const proposalId = Number(body.proposalId);

    if (
      !wallet ||
      !registerMessage ||
      !registerSignature ||
      !voteMessage ||
      !voteSignature ||
      Number.isNaN(proposalId)
    ) {
      return res.status(400).json({
        ok: false,
        message: "Sign whitelist + vote messages in Phantom (no saved secrets)"
      });
    }

    if (voteMessage !== buildVoteMessage(wallet, proposalId)) {
      return res.status(400).json({ ok: false, message: "Vote message mismatch" });
    }

    const reg = commitmentHexFromRegisterSig(registerSignature, registerMessage, wallet);
    if (!reg.ok) return res.status(401).json({ ok: false, message: reg.error });

    const vote = nullifierHexFromVoteSig(voteSignature, voteMessage, wallet);
    if (!vote.ok) return res.status(401).json({ ok: false, message: vote.error });

    const approved = await store.getApprovedByCommitment(reg.commitmentHex);
    if (!approved) {
      return res.status(401).json({ ok: false, message: "Not whitelisted — wait for admin approval" });
    }

    const deployedPath = path.join(__dirname, "..", "public", "solana-deployed.json");
    const deployed = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
    const onChain = await isCommitmentEligible(deployed.ballot, reg.commitmentHex);
    if (!onChain) {
      return res.status(401).json({
        ok: false,
        message: "Not on-chain whitelist yet — admin must Approve with Phantom"
      });
    }

    const txId = await solanaRelayer.relayVote(proposalId, reg.commitmentHex, vote.nullifierHex);

    return res.json({ ok: true, txId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: e.message || "Server error" });
  }
};

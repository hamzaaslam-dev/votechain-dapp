const store = require("../lib/applicationStore");
const solanaRelayer = require("../lib/solanaRelayer");
const { assertApprovedVoter } = require("../lib/verifyApprovedVoter");

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
    const cnic = String(body.cnic || "").trim();
    const votingToken = String(body.votingToken || "").trim().toLowerCase();
    const proposalId = Number(body.proposalId);

    if (!cnic || !votingToken || Number.isNaN(proposalId)) {
      return res.status(400).json({ ok: false, message: "Missing cnic, votingToken, or proposalId" });
    }

    const check = await assertApprovedVoter(cnic, votingToken);
    if (!check.ok) {
      return res.status(401).json({ ok: false, message: check.error });
    }

    const txId = await solanaRelayer.relayVote(votingToken, proposalId);
    await store.setVoted(cnic);

    return res.json({ ok: true, txId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: e.message || "Server error" });
  }
};

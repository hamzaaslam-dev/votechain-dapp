const store = require("./applicationStore");
const { hashVotingToken, isValidVotingToken } = require("./votingTokenHash");

async function assertApprovedVoter(cnic, votingToken) {
  const c = String(cnic || "").trim();
  const t = String(votingToken || "").trim().toLowerCase();

  if (!/^\d{13}$/.test(c)) {
    return { ok: false, error: "CNIC must be 13 digits" };
  }
  if (!isValidVotingToken(t)) {
    return { ok: false, error: "Invalid voting token (generate a new one and apply)" };
  }

  const app = await store.getByCnic(c);
  if (!app) {
    return { ok: false, error: "No application for this CNIC — submit an application first" };
  }
  if (!app.votingTokenHash) {
    return { ok: false, error: "Old application — submit a new application with a new voting ID" };
  }
  if (app.status !== "approved") {
    return { ok: false, error: `Not approved yet (status: ${app.status})` };
  }
  if (app.votedAt) {
    return { ok: false, error: "You already voted with this CNIC" };
  }
  if (app.votingTokenHash !== hashVotingToken(t)) {
    return { ok: false, error: "Voting ID does not match your application — use the same ID you applied with" };
  }

  return { ok: true, app };
}

module.exports = { assertApprovedVoter };

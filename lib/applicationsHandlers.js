const store = require("./applicationStore");
const { verifyBallotAdminSession } = require("./walletAdminAuth");
const { hashVotingToken, isValidVotingToken } = require("./votingTokenHash");

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

async function assertWalletAdminAuth(body, res) {
  const ballotAddress = String(body.ballotAddress || "").trim();
  const wallet = String(body.wallet || "").trim();
  const message = String(body.message || "");
  const signature = String(body.signature || "").trim();
  const v = await verifyBallotAdminSession(ballotAddress, message, signature, wallet);
  if (!v.ok) {
    res.status(401).json({ ok: false, message: v.error });
    return false;
  }
  return true;
}

async function handleApply(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = parseJsonBody(req);
  const fullName = String(body.fullName || "").trim();
  const phone = String(body.phone || "").trim();
  const cnic = String(body.cnic || "").trim();
  const votingToken = String(body.votingToken || "").trim().toLowerCase();

  if (fullName.length < 2) {
    return res.status(400).json({ ok: false, message: "Full name is required" });
  }
  if (phone.length < 7) {
    return res.status(400).json({ ok: false, message: "Phone is required" });
  }
  if (!/^\d{13}$/.test(cnic)) {
    return res.status(400).json({ ok: false, message: "CNIC must be exactly 13 digits" });
  }
  if (!isValidVotingToken(votingToken)) {
    return res.status(400).json({ ok: false, message: "Generate a voting ID first (64-character hex)" });
  }

  const votingTokenHash = hashVotingToken(votingToken);
  if (await store.hasPendingDuplicate(cnic, votingTokenHash)) {
    return res.status(409).json({
      ok: false,
      message: "Duplicate pending application (same CNIC or same voting ID)"
    });
  }

  const entry = await store.addApplication({ fullName, phone, cnic, votingTokenHash });
  return res.status(201).json({ ok: true, id: entry.id });
}

async function handleAdminApplicationsList(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = parseJsonBody(req);
  if (!(await assertWalletAdminAuth(body, res))) return;

  const status = String(body.status || "pending");
  const apps = await store.listByStatus(status);
  return res.json({ ok: true, applications: apps });
}

async function handleAdminReject(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = parseJsonBody(req);
  if (!(await assertWalletAdminAuth(body, res))) return;

  const id = String(body.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

  const row = await store.getById(id);
  if (!row) return res.status(404).json({ ok: false, message: "Not found" });
  if (row.status !== "pending") {
    return res.status(400).json({ ok: false, message: "Application is not pending" });
  }

  await store.setRejected(id);
  return res.json({ ok: true });
}

async function handleAdminMarkApproved(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = parseJsonBody(req);
  if (!(await assertWalletAdminAuth(body, res))) return;

  const id = String(body.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

  const row = await store.getById(id);
  if (!row) return res.status(404).json({ ok: false, message: "Not found" });
  if (row.status !== "pending") {
    return res.status(400).json({ ok: false, message: "Application is not pending" });
  }
  if (!row.votingTokenHash && !row.blindedToken) {
    return res.status(400).json({ ok: false, message: "Old application — ask voter to apply again" });
  }

  await store.setApproved(id);
  return res.json({ ok: true });
}

async function handleGetStatus(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = parseJsonBody(req);
  const cnic = String(body.cnic || "").trim();

  if (!/^\d{13}$/.test(cnic)) {
    return res.status(400).json({ ok: false, message: "CNIC must be exactly 13 digits" });
  }

  const app = await store.getByCnic(cnic);
  if (!app) {
    return res.json({ ok: true, status: "not_found" });
  }

  return res.json({
    ok: true,
    status: app.status,
    voted: Boolean(app.votedAt)
  });
}

module.exports = {
  handleApply,
  handleAdminApplicationsList,
  handleAdminReject,
  handleAdminMarkApproved,
  handleGetStatus,
  parseJsonBody
};

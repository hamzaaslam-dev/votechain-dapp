const store = require("./applicationStore");
const { verifyBallotAdminSession } = require("./walletAdminAuth");
const {
  buildWhitelistMessage,
  commitmentHexFromRegisterSig
} = require("./walletVoterAuth");

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
  const cnic = String(body.cnic || "").trim();
  const wallet = String(body.wallet || "").trim();
  const message = String(body.message || "");
  const signature = String(body.signature || "").trim();

  if (!/^\d{13}$/.test(cnic)) {
    return res.status(400).json({ ok: false, message: "CNIC must be exactly 13 digits" });
  }
  if (!wallet || !message || !signature) {
    return res.status(400).json({ ok: false, message: "Connect wallet and sign the whitelist message" });
  }

  const expected = buildWhitelistMessage(cnic, wallet);
  if (message !== expected) {
    return res.status(400).json({ ok: false, message: "Whitelist message mismatch — sign again in Phantom" });
  }

  const derived = commitmentHexFromRegisterSig(signature, message, wallet);
  if (!derived.ok) {
    return res.status(401).json({ ok: false, message: derived.error });
  }

  if (await store.hasPendingCnic(cnic)) {
    return res.status(409).json({ ok: false, message: "CNIC already has a pending application" });
  }

  const entry = await store.addApplication({
    cnic,
    wallet,
    commitmentHex: derived.commitmentHex
  });

  return res.status(201).json({
    ok: true,
    id: entry.id,
    commitmentHex: derived.commitmentHex
  });
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
  const approvedTx = String(body.approvedTx || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

  const row = await store.getById(id);
  if (!row) return res.status(404).json({ ok: false, message: "Not found" });
  if (row.status !== "pending") {
    return res.status(400).json({ ok: false, message: "Application is not pending" });
  }

  await store.setApproved(id, approvedTx || null);
  return res.json({ ok: true });
}

async function handleGetStatus(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = parseJsonBody(req);
  const cnic = String(body.cnic || "").trim();
  const wallet = String(body.wallet || "").trim();
  const message = String(body.message || "");
  const signature = String(body.signature || "").trim();

  if (!/^\d{13}$/.test(cnic) || !wallet || !message || !signature) {
    return res.status(400).json({ ok: false, message: "CNIC + wallet signature required" });
  }

  if (message !== buildWhitelistMessage(cnic, wallet)) {
    return res.status(400).json({ ok: false, message: "Message mismatch" });
  }

  const derived = commitmentHexFromRegisterSig(signature, message, wallet);
  if (!derived.ok) {
    return res.status(401).json({ ok: false, message: derived.error });
  }

  const app = await store.getByCnic(cnic);
  if (!app) {
    return res.json({ ok: true, status: "not_found" });
  }

  return res.json({
    ok: true,
    status: app.status,
    commitmentHex: app.commitmentHex
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

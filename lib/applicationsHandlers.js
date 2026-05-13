const { ethers } = require("ethers");
const store = require("./applicationStore");
const { verifyRegistryAdminSession } = require("./walletAdminAuth");

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
  const registryAddress = String(body.registryAddress || "").trim();
  const message = String(body.message || "");
  const signature = String(body.signature || "").trim();
  const v = await verifyRegistryAdminSession(registryAddress, message, signature);
  if (!v.ok) {
    res.status(401).json({ ok: false, message: v.error });
    return false;
  }
  return true;
}

function handleApply(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = parseJsonBody(req);
  const fullName = String(body.fullName || "").trim();
  const phone = String(body.phone || "").trim();
  const cnic = String(body.cnic || "").trim();
  const commitment = String(body.commitment || "").trim();

  if (fullName.length < 2) {
    return res.status(400).json({ ok: false, message: "Full name is required" });
  }
  if (!/^\d{13}$/.test(cnic)) {
    return res.status(400).json({ ok: false, message: "CNIC must be 13 digits" });
  }
  if (phone.length < 7) {
    return res.status(400).json({ ok: false, message: "Phone is required" });
  }
  if (!ethers.isHexString(commitment, 32)) {
    return res.status(400).json({ ok: false, message: "Invalid commitment (bytes32)" });
  }

  if (store.hasPendingCnic(cnic)) {
    return res.status(409).json({ ok: false, message: "You already have a pending application with this CNIC" });
  }

  const entry = store.addApplication({ fullName, phone, cnic, commitment });
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
  const apps = store.listByStatus(status);
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

  const row = store.getById(id);
  if (!row) return res.status(404).json({ ok: false, message: "Not found" });
  if (row.status !== "pending") {
    return res.status(400).json({ ok: false, message: "Application is not pending" });
  }

  store.setRejected(id);
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

  const row = store.getById(id);
  if (!row) return res.status(404).json({ ok: false, message: "Not found" });
  if (row.status !== "pending") {
    return res.status(400).json({ ok: false, message: "Application is not pending" });
  }

  store.setApproved(id, approvedTx || null);
  return res.json({ ok: true });
}

module.exports = {
  handleApply,
  handleAdminApplicationsList,
  handleAdminReject,
  handleAdminMarkApproved,
  parseJsonBody
};

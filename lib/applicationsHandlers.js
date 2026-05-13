const { ethers } = require("ethers");
const { parse: parseUrl } = require("url");
const store = require("./applicationStore");

function getBearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}

function assertDashboardAuth(req, res) {
  const expected = process.env.DASHBOARD_TOKEN;
  if (!expected) {
    console.warn("[admin] DASHBOARD_TOKEN not set — allowing list (dev only). Set DASHBOARD_TOKEN in production.");
    return true;
  }
  const token = getBearer(req);
  if (token !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing dashboard token" });
    return false;
  }
  return true;
}

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

function getStatusQuery(req) {
  if (req.query && req.query.status) return String(req.query.status);
  const q = parseUrl(req.url || "", true).query || {};
  return (q.status && String(q.status)) || "pending";
}

function handleAdminApplications(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }
  if (!assertDashboardAuth(req, res)) return;

  const status = getStatusQuery(req);
  const apps = store.listByStatus(status);
  return res.json({ ok: true, applications: apps });
}

function handleAdminReject(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }
  if (!assertDashboardAuth(req, res)) return;

  const body = parseJsonBody(req);
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

function handleAdminMarkApproved(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }
  if (!assertDashboardAuth(req, res)) return;

  const body = parseJsonBody(req);
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
  handleAdminApplications,
  handleAdminReject,
  handleAdminMarkApproved,
  assertDashboardAuth,
  getBearer
};

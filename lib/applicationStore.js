const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "applications.json");

/** In-memory list; persisted to disk when possible (local Express). */
let applications = null;

function loadFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return Array.isArray(raw) ? raw : [];
    }
  } catch (e) {
    console.error("[applicationStore] read error", e.message);
  }
  return [];
}

function readAll() {
  if (applications === null) {
    applications = loadFromDisk();
  }
  return applications;
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(applications, null, 2), "utf8");
  } catch (e) {
    console.warn("[applicationStore] disk write skipped:", e.message);
  }
}

function addApplication(fields) {
  const list = readAll();
  const id = crypto.randomUUID();
  const entry = {
    id,
    status: "pending",
    createdAt: new Date().toISOString(),
    fullName: String(fields.fullName || "").trim(),
    phone: String(fields.phone || "").trim(),
    cnic: String(fields.cnic || "").trim(),
    commitment: String(fields.commitment || "").trim()
  };
  list.push(entry);
  applications = list;
  persist();
  return entry;
}

function hasPendingCnic(cnic) {
  return readAll().some((a) => a.status === "pending" && a.cnic === cnic);
}

function listByStatus(status) {
  const list = readAll();
  if (!status || status === "all") return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return list.filter((a) => a.status === status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getById(id) {
  return readAll().find((a) => a.id === id) || null;
}

function setApproved(id, approvedTx) {
  const list = readAll();
  const i = list.findIndex((a) => a.id === id);
  if (i === -1) return null;
  list[i].status = "approved";
  list[i].approvedAt = new Date().toISOString();
  list[i].approvedTx = approvedTx || null;
  applications = list;
  persist();
  return list[i];
}

function setRejected(id) {
  const list = readAll();
  const i = list.findIndex((a) => a.id === id);
  if (i === -1) return null;
  list[i].status = "rejected";
  list[i].rejectedAt = new Date().toISOString();
  applications = list;
  persist();
  return list[i];
}

module.exports = {
  addApplication,
  hasPendingCnic,
  listByStatus,
  getById,
  setApproved,
  setRejected
};

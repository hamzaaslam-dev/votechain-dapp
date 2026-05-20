const { kv } = require("@vercel/kv");
const crypto = require("crypto");

async function addApplication(fields) {
  const id = crypto.randomUUID();
  const entry = {
    id,
    status: "pending",
    createdAt: new Date().toISOString(),
    cnic: String(fields.cnic || "").trim(),
    wallet: String(fields.wallet || "").trim(),
    commitmentHex: String(fields.commitmentHex || "").trim()
  };

  try {
    await kv.hset("applications", { [id]: entry });
  } catch (e) {
    console.warn("[applicationStore] KV error on addApplication:", e.message);
  }

  return entry;
}

async function hasPendingCnic(cnic) {
  try {
    const apps = (await kv.hgetall("applications")) || {};
    return Object.values(apps).some((a) => a.status === "pending" && a.cnic === cnic);
  } catch (e) {
    console.warn("[applicationStore] KV error:", e.message);
    return false;
  }
}

async function listByStatus(status) {
  try {
    const apps = (await kv.hgetall("applications")) || {};
    const list = Object.values(apps);
    if (!status || status === "all") return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return list.filter((a) => a.status === status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch (e) {
    console.warn("[applicationStore] KV error:", e.message);
    return [];
  }
}

async function getById(id) {
  try {
    return (await kv.hget("applications", id)) || null;
  } catch (e) {
    console.warn("[applicationStore] KV error:", e.message);
    return null;
  }
}

async function getByCnic(cnic) {
  try {
    const apps = (await kv.hgetall("applications")) || {};
    const matches = Object.values(apps).filter((a) => a.cnic === cnic);
    if (matches.length === 0) return null;
    return matches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  } catch (e) {
    console.warn("[applicationStore] KV error:", e.message);
    return null;
  }
}

async function getApprovedByCommitment(commitmentHex) {
  try {
    const apps = (await kv.hgetall("applications")) || {};
    const h = commitmentHex.toLowerCase();
    return (
      Object.values(apps).find(
        (a) => a.status === "approved" && String(a.commitmentHex).toLowerCase() === h
      ) || null
    );
  } catch (e) {
    console.warn("[applicationStore] KV error:", e.message);
    return null;
  }
}

async function setApproved(id, approvedTx) {
  const row = await getById(id);
  if (!row) return null;

  row.status = "approved";
  row.approvedAt = new Date().toISOString();
  if (approvedTx) row.approvedTx = approvedTx;

  try {
    await kv.hset("applications", { [id]: row });
  } catch (e) {
    console.warn("[applicationStore] KV error on setApproved:", e.message);
  }
  return row;
}

async function setRejected(id) {
  const row = await getById(id);
  if (!row) return null;

  row.status = "rejected";
  row.rejectedAt = new Date().toISOString();

  try {
    await kv.hset("applications", { [id]: row });
  } catch (e) {
    console.warn("[applicationStore] KV error on setRejected:", e.message);
  }
  return row;
}

module.exports = {
  addApplication,
  hasPendingCnic,
  listByStatus,
  getById,
  getByCnic,
  getApprovedByCommitment,
  setApproved,
  setRejected
};

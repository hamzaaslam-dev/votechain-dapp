const { handleAdminReject, handleAdminMarkApproved } = require("../../lib/applicationsHandlers");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      return res.status(400).json({ ok: false, message: "Invalid JSON" });
    }
  }

  const action = String(body.action || "").trim();
  if (action === "reject") {
    req.body = body;
    return handleAdminReject(req, res);
  }
  if (action === "mark-approved") {
    req.body = body;
    return handleAdminMarkApproved(req, res);
  }
  return res.status(400).json({ ok: false, message: "action must be reject or mark-approved" });
};

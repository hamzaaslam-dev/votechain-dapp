const { validCnicSet } = require("../lib/validCnic");

module.exports = (req, res) => {
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

  const { cnic } = body || {};
  if (!/^\d{13}$/.test(cnic || "")) {
    return res.status(400).json({ ok: false, message: "CNIC must be 13 digits" });
  }

  const eligible = validCnicSet.has(cnic);
  return res.status(200).json({ ok: true, eligible });
};

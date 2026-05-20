const { getAdminKey } = require("../lib/adminKeyStore");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }
  
  try {
    const { adminN, adminE } = await getAdminKey();
    return res.json({ ok: true, N: adminN.toString(), E: adminE.toString() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: e.message || "Server error" });
  }
};

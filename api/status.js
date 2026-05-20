const { handleGetStatus } = require("../lib/applicationsHandlers");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  try {
    return await handleGetStatus(req, res);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: e.message || "Server error" });
  }
};

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const applicationsHandlers = require("../lib/applicationsHandlers");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const validCnicSet = new Set(["1111111111111", "2222222222222", "3333333333333"]);

app.get("/api/health", (_, res) => {
  res.json({ ok: true, chain: "solana" });
});

app.post("/api/apply", (req, res) => applicationsHandlers.handleApply(req, res));

app.post("/api/admin/applications-list", async (req, res, next) => {
  try {
    await applicationsHandlers.handleAdminApplicationsList(req, res);
  } catch (e) {
    next(e);
  }
});

app.post("/api/admin/application-action", async (req, res, next) => {
  try {
    const action = String(req.body?.action || "").trim();
    if (action === "reject") await applicationsHandlers.handleAdminReject(req, res);
    else if (action === "mark-approved") await applicationsHandlers.handleAdminMarkApproved(req, res);
    else res.status(400).json({ ok: false, message: "action must be reject or mark-approved" });
  } catch (e) {
    next(e);
  }
});

app.post("/api/verify-cnic", (req, res) => {
  const { cnic } = req.body;
  if (!/^\d{13}$/.test(cnic || "")) {
    return res.status(400).json({ ok: false, message: "CNIC must be 13 digits" });
  }
  res.json({ ok: true, eligible: validCnicSet.has(cnic) });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, message: err.message || "Server error" });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`VoteChain (Solana) API: http://localhost:${port}`);
});

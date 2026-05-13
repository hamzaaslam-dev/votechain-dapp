require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const applicationsHandlers = require("../lib/applicationsHandlers");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const voterRegistryAbi = [
  "function addEligibleVoters(bytes32[] commitments) external"
];

// Demo-only in-memory CNIC allowlist.
const validCnicSet = new Set([
  "1111111111111",
  "2222222222222",
  "3333333333333"
]);

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/api/apply", (req, res) => applicationsHandlers.handleApply(req, res));

app.get("/api/admin/applications", (req, res) => applicationsHandlers.handleAdminApplications(req, res));

app.post("/api/admin/application-action", (req, res) => {
  const action = String(req.body?.action || "").trim();
  if (action === "reject") return applicationsHandlers.handleAdminReject(req, res);
  if (action === "mark-approved") return applicationsHandlers.handleAdminMarkApproved(req, res);
  return res.status(400).json({ ok: false, message: "action must be reject or mark-approved" });
});

app.post("/api/verify-cnic", (req, res) => {
  const { cnic } = req.body;

  if (!/^\d{13}$/.test(cnic || "")) {
    return res.status(400).json({ ok: false, message: "CNIC must be 13 digits" });
  }

  const eligible = validCnicSet.has(cnic);
  res.json({ ok: true, eligible });
});

app.post("/api/admin/add-commitment", async (req, res) => {
  try {
    const { commitment } = req.body;
    if (!ethers.isHexString(commitment, 32)) {
      return res.status(400).json({ ok: false, message: "Invalid commitment bytes32" });
    }

    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    const privateKey = process.env.ADMIN_PRIVATE_KEY;
    const registryAddress = process.env.VOTER_REGISTRY_ADDRESS;

    if (!rpcUrl || !privateKey || !registryAddress) {
      return res.status(500).json({
        ok: false,
        message: "Missing SEPOLIA_RPC_URL, ADMIN_PRIVATE_KEY, or VOTER_REGISTRY_ADDRESS in .env"
      });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const registry = new ethers.Contract(registryAddress, voterRegistryAbi, wallet);
    const tx = await registry.addEligibleVoters([commitment]);
    await tx.wait();

    res.json({ ok: true, txHash: tx.hash });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const applicationsHandlers = require("../lib/applicationsHandlers");
const fs = require("fs");
const path = require("path");
const store = require("../lib/applicationStore");
const solanaRelayer = require("../lib/solanaRelayer");
const { isCommitmentEligible } = require("../lib/ballotOnChain");
const {
  buildVoteMessage,
  commitmentHexFromRegisterSig,
  nullifierHexFromVoteSig
} = require("../lib/walletVoterAuth");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const validCnicSet = new Set(["1111111111111", "2222222222222", "3333333333333"]);

app.get("/api/health", (_, res) => {
  res.json({ ok: true, chain: "solana" });
});

app.post("/api/relay-vote", async (req, res, next) => {
  try {
    const {
      wallet,
      registerMessage,
      registerSignature,
      voteMessage,
      voteSignature,
      proposalId
    } = req.body;
    const pid = Number(proposalId);

    if (
      !wallet ||
      !registerMessage ||
      !registerSignature ||
      !voteMessage ||
      !voteSignature ||
      Number.isNaN(pid)
    ) {
      return res.status(400).json({ ok: false, message: "Missing wallet signatures" });
    }

    if (voteMessage !== buildVoteMessage(wallet, pid)) {
      return res.status(400).json({ ok: false, message: "Vote message mismatch" });
    }

    const reg = commitmentHexFromRegisterSig(registerSignature, registerMessage, wallet);
    if (!reg.ok) return res.status(401).json({ ok: false, message: reg.error });

    const vote = nullifierHexFromVoteSig(voteSignature, voteMessage, wallet);
    if (!vote.ok) return res.status(401).json({ ok: false, message: vote.error });

    const approved = await store.getApprovedByCommitment(reg.commitmentHex);
    if (!approved) {
      return res.status(401).json({ ok: false, message: "Not whitelisted" });
    }

    const deployed = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "public", "solana-deployed.json"), "utf8")
    );
    if (!(await isCommitmentEligible(deployed.ballot, reg.commitmentHex))) {
      return res.status(401).json({ ok: false, message: "Not on-chain whitelist" });
    }

    const txId = await solanaRelayer.relayVote(pid, reg.commitmentHex, vote.nullifierHex);
    res.json({ ok: true, txId });
  } catch (e) {
    next(e);
  }
});

app.post("/api/apply", async (req, res, next) => {
  try {
    await applicationsHandlers.handleApply(req, res);
  } catch (e) {
    next(e);
  }
});

app.post("/api/status", async (req, res, next) => {
  try {
    await applicationsHandlers.handleGetStatus(req, res);
  } catch (e) {
    next(e);
  }
});

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

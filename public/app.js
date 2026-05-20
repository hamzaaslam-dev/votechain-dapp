/* global solanaWeb3, buildWhitelistMessage, buildVoteMessage, connectPhantom, signText */

let walletPubkey = null;

function showToast(msg, type = "info") {
  const toast = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  document.getElementById("toastIcon").textContent =
    { ok: "✅", err: "❌", info: "ℹ️", pending: "⏳" }[type] || "ℹ️";
  toast.className = `toast show toast-${type}`;
  setTimeout(() => toast.classList.remove("show"), type === "err" ? 7000 : 4000);
}

function walletStr() {
  if (!walletPubkey) throw new Error("Connect Phantom first");
  return walletPubkey.toBase58();
}

document.getElementById("connectWallet").onclick = async () => {
  try {
    walletPubkey = await connectPhantom();
    document.getElementById("walletLine").textContent = `Connected: ${walletStr()}`;
    showToast("Phantom connected (Devnet)", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

document.getElementById("btnWhitelist").onclick = async () => {
  try {
    const cnic = document.getElementById("applyCnic").value.trim();
    if (!/^\d{13}$/.test(cnic)) throw new Error("CNIC must be 13 digits");

    const phantom = window.solana;
    const message = buildWhitelistMessage(cnic, walletStr());
    showToast("Sign whitelist in Phantom…", "pending");
    const signature = await signText(phantom, message);

    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnic, wallet: walletStr(), message, signature })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Whitelist failed");

    document.getElementById("applyResult").textContent =
      `Submitted. Admin whitelists your wallet hash on-chain — not your vote.`;
    showToast("CNIC submitted for whitelist", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

document.getElementById("btnCheckStatus").onclick = async () => {
  try {
    const cnic = document.getElementById("applyCnic").value.trim();
    if (!/^\d{13}$/.test(cnic)) throw new Error("CNIC must be 13 digits");

    const phantom = window.solana;
    const message = buildWhitelistMessage(cnic, walletStr());
    showToast("Sign to check status…", "pending");
    const signature = await signText(phantom, message);

    const res = await fetch("/api/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnic, wallet: walletStr(), message, signature })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Status failed");

    document.getElementById("applyResult").textContent = `Status: ${data.status}`;
    showToast(`Status: ${data.status}`, data.status === "approved" ? "ok" : "info");
  } catch (e) {
    showToast(e.message, "err");
  }
};

document.getElementById("btnVote").onclick = async () => {
  try {
    const cnic = document.getElementById("applyCnic").value.trim();
    if (!/^\d{13}$/.test(cnic)) throw new Error("CNIC must be 13 digits");

    const proposalId = Number(document.getElementById("proposalId").value || 0);
    const phantom = window.solana;
    const w = walletStr();

    const registerMessage = buildWhitelistMessage(cnic, w);
    showToast("Sign whitelist message…", "pending");
    const registerSignature = await signText(phantom, registerMessage);

    const voteMessage = buildVoteMessage(w, proposalId);
    showToast("Sign vote message…", "pending");
    const voteSignature = await signText(phantom, voteMessage);

    showToast("Submitting vote (no CNIC sent)…", "pending");
    const res = await fetch("/api/relay-vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: w,
        registerMessage,
        registerSignature,
        voteMessage,
        voteSignature,
        proposalId
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Vote failed");

    const explorerUrl = `https://explorer.solana.com/tx/${data.txId}?cluster=devnet`;
    document.getElementById("voteResult").innerHTML = `Vote tx: <a href="${explorerUrl}" target="_blank" class="explorer-link">${data.txId}</a>`;
    showToast("Vote recorded on-chain", "ok");
    setTimeout(refreshTally, 1200);
  } catch (e) {
    showToast(e.message, "err");
  }
};

const PROPOSAL_NAMES = {
  0: "Community Grant Allocation",
  1: "Protocol Upgrade v2.1",
  2: "Validator Expansion Program",
  3: "Developer Funding Initiative",
  4: "Marketing Campaign Approval",
  5: "Security Audit Sponsorship",
  6: "Liquidity Incentive Program",
  7: "Governance Fee Restructuring"
};

let activeBallotAddress = null;

async function refreshTally() {
  if (!activeBallotAddress) {
    const deployed = await loadDeployedAddresses();
    if (!deployed?.ballot) return;
    activeBallotAddress = deployed.ballot;
  }

  const conn = solanaConnection();
  const data = await fetchBallotData(conn, activeBallotAddress);
  if (!data) {
    document.getElementById("resultsTally").innerHTML = `<div class="results-empty">Could not load ballot details from blockchain</div>`;
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const isEnded = now > data.endTs;

  let statusBadge = "";
  let timeText = "";

  if (isEnded) {
    statusBadge = `<span class="status-pill err">Concluded</span>`;
    timeText = `Voting ended on ${new Date(data.endTs * 1000).toLocaleString()}`;
  } else {
    statusBadge = `<span class="status-pill ok">Active</span>`;
    const diff = data.endTs - now;
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${mins}m`);
    timeText = `Ends in: ${parts.join(" ")}`;
  }

  const votesSlice = data.proposalVotes.slice(0, data.proposalCount);
  const totalVotes = votesSlice.reduce((sum, v) => sum + v, 0);
  const maxVotes = Math.max(...votesSlice);

  let proposalRowsHtml = "";
  for (let i = 0; i < data.proposalCount; i++) {
    const votes = votesSlice[i];
    const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
    const isWinner = maxVotes > 0 && votes === maxVotes;
    const winnerClass = isWinner ? "winner" : "";
    const name = PROPOSAL_NAMES[i] || `Proposal ${i}`;

    proposalRowsHtml += `
      <div class="result-row">
        <div class="result-meta">
          <span class="result-name">${name}</span>
          <span class="result-votes">${votes} votes (${pct}%)</span>
        </div>
        <div class="result-bar-bg">
          <div class="result-bar-fill ${winnerClass}" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }

  document.getElementById("resultsTally").innerHTML = `
    <div class="results-bars">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span class="field-label" style="margin-bottom: 0;">Status</span>
        ${statusBadge}
      </div>
      <div style="font-size: 0.78rem; color: var(--muted); margin-bottom: 16px; text-align: right;">
        ${timeText}
      </div>
      ${proposalRowsHtml}
    </div>
  `;
}

async function fetchBallotData(connection, ballotAddress) {
  try {
    const info = await connection.getAccountInfo(new solanaWeb3.PublicKey(ballotAddress));
    if (!info?.data || info.data.length < 154) {
      return null;
    }
    const data = info.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    const startTs = Number(view.getBigInt64(73, true));
    const endTs = Number(view.getBigInt64(81, true));
    const proposalCount = data[89];

    const proposalVotes = [];
    for (let i = 0; i < 8; i++) {
      proposalVotes.push(Number(view.getBigUint64(90 + i * 8, true)));
    }

    return { startTs, endTs, proposalCount, proposalVotes };
  } catch (e) {
    console.error("fetchBallotData error:", e);
    return null;
  }
}

(async function init() {
  const deployed = await loadDeployedAddresses();
  const hint = document.getElementById("deployHint");
  if (!deployed?.ballot && hint) {
    hint.textContent = "Deploy Solana and add public/solana-deployed.json";
  } else if (hint) {
    hint.textContent = `Devnet · ballot ${deployed.ballot.slice(0, 8)}…`;
    activeBallotAddress = deployed.ballot;
    refreshTally();
    setInterval(refreshTally, 15000);
  }
})();

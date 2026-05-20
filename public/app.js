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

    document.getElementById("voteResult").textContent = `Vote tx: ${data.txId}`;
    showToast("Vote recorded on-chain", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

(async function init() {
  const deployed = await loadDeployedAddresses();
  const hint = document.getElementById("deployHint");
  if (!deployed?.ballot && hint) {
    hint.textContent = "Deploy Solana and add public/solana-deployed.json";
  } else if (hint) {
    hint.textContent = `Devnet · ballot ${deployed.ballot.slice(0, 8)}…`;
  }
})();

let votingToken = localStorage.getItem("votingToken") || null;

function showToast(msg, type = "info") {
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  const toastIcon = document.getElementById("toastIcon");
  const icons = { ok: "✅", err: "❌", info: "ℹ️", pending: "⏳" };
  toastIcon.textContent = icons[type] || "ℹ️";
  toastMsg.textContent = msg;
  toast.className = `toast show toast-${type}`;
  setTimeout(() => toast.classList.remove("show"), type === "err" ? 6000 : 4000);
}

function getCnic() {
  return (localStorage.getItem("applyCnic") || document.getElementById("applyCnic").value || "").trim();
}

document.getElementById("btnGenerateId").onclick = () => {
  try {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    votingToken = Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem("votingToken", votingToken);
    document.getElementById("votingIdHex").textContent = `${votingToken.slice(0, 12)}…${votingToken.slice(-8)}`;
    document.getElementById("identityBox").classList.remove("hidden");
    showToast("Voting ID created — save it or keep this browser open", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

document.getElementById("btnApply").onclick = async () => {
  try {
    if (!votingToken) throw new Error("Click “Generate voting ID” first");

    const fullName = document.getElementById("applyFullName").value.trim();
    const phone = document.getElementById("applyPhone").value.trim();
    const cnic = document.getElementById("applyCnic").value.trim();
    if (!/^\d{13}$/.test(cnic)) throw new Error("CNIC must be 13 digits");

    localStorage.setItem("applyCnic", cnic);

    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, phone, cnic, votingToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Apply failed");

    document.getElementById("applyResult").textContent =
      `Submitted. Wait for admin approval, then vote with the same CNIC and voting ID.`;
    showToast("Application sent", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

const btnCheckStatus = document.getElementById("btnCheckStatus");
if (btnCheckStatus) {
  btnCheckStatus.onclick = async () => {
    try {
      const cnic = getCnic();
      if (!/^\d{13}$/.test(cnic)) throw new Error("Enter your 13-digit CNIC");

      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnic })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Status check failed");

      let msg = `Status: ${data.status}`;
      if (data.status === "approved" && !data.voted) msg += " — you can vote now";
      if (data.voted) msg += " — already voted";
      document.getElementById("applyResult").textContent = msg;
      showToast(msg, data.status === "approved" ? "ok" : "info");
    } catch (e) {
      showToast(e.message, "err");
    }
  };
}

document.getElementById("btnVote").onclick = async () => {
  try {
    if (!votingToken) {
      votingToken = localStorage.getItem("votingToken");
    }
    if (!votingToken) throw new Error("Generate a voting ID first (or use the same browser you applied from)");

    const cnic = getCnic();
    if (!/^\d{13}$/.test(cnic)) throw new Error("Enter the same CNIC you used when applying");

    const proposalId = Number(document.getElementById("proposalId").value || 0);

    showToast("Submitting vote…", "pending");
    const res = await fetch("/api/relay-vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnic, votingToken, proposalId })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Vote failed");

    document.getElementById("voteResult").textContent = `Vote recorded. Tx: ${data.txId}`;
    showToast("Vote submitted!", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

(async function init() {
  const deployed = await loadDeployedAddresses();
  const hint = document.getElementById("deployHint");
  if (!deployed?.programId) {
    if (hint) {
      hint.textContent = "Deploy Solana and add public/solana-deployed.json (see solana/README.md).";
    }
    return;
  }
  if (hint) {
    hint.textContent = `Devnet · ballot ${deployed.ballot.slice(0, 8)}…`;
  }
  if (votingToken) {
    document.getElementById("votingIdHex").textContent = `${votingToken.slice(0, 12)}…${votingToken.slice(-8)}`;
    document.getElementById("identityBox").classList.remove("hidden");
  }
})();

const registryAbi = ["function addEligibleVoters(bytes32[] commitments) external"];

let provider;
let signer;
let userAddress;
let toastTimer;

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  const toastIcon = document.getElementById("toastIcon");
  const icons = { ok: "✅", err: "❌", info: "ℹ️", pending: "⏳" };
  toastIcon.textContent = icons[type] || "ℹ️";
  toastMsg.textContent = message;
  toast.className = `toast show toast-${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), type === "err" ? 6000 : 4000);
}

function authHeaders() {
  const el = document.getElementById("dashToken");
  const t = (el.value.trim() || sessionStorage.getItem("dashboardToken") || "").trim();
  if (t) sessionStorage.setItem("dashboardToken", t);
  const h = { "Content-Type": "application/json" };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function loadSettings() {
  const tok = sessionStorage.getItem("dashboardToken");
  if (tok) document.getElementById("dashToken").value = tok;
  const reg = sessionStorage.getItem("registryAddressDash") || "";
  if (reg) document.getElementById("registryAddress").value = reg;
}

document.getElementById("saveSettings").onclick = () => {
  const tok = document.getElementById("dashToken").value.trim();
  const reg = document.getElementById("registryAddress").value.trim();
  if (tok) sessionStorage.setItem("dashboardToken", tok);
  if (reg) sessionStorage.setItem("registryAddressDash", reg);
  showToast("Saved in this browser", "ok");
};

document.getElementById("connectWallet").onclick = async () => {
  const btn = document.getElementById("connectWallet");
  const orig = btn.innerHTML;
  try {
    if (!window.ethereum) throw new Error("Install MetaMask");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();
    btn.innerHTML = `<span>✅</span> ${userAddress.slice(0, 6)}…${userAddress.slice(-4)}`;
    btn.disabled = false;
    document.getElementById("dashStatus").textContent = `Connected: ${userAddress}`;
    showToast("Wallet connected", "ok");
  } catch (e) {
    btn.innerHTML = orig;
    btn.disabled = false;
    showToast(e.message, "err");
  }
};

async function apiAction(body) {
  const res = await fetch("/api/admin/application-action", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText);
  return data;
}

async function loadTable() {
  const status = document.getElementById("statusFilter").value;
  const res = await fetch(`/api/admin/applications?status=${encodeURIComponent(status)}`, {
    headers: authHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to load list");

  const tbody = document.getElementById("appsBody");
  tbody.innerHTML = "";
  const apps = data.applications || [];
  if (apps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="dash-empty">No rows</td></tr>`;
    return;
  }

  for (const row of apps) {
    const tr = document.createElement("tr");
    const short = row.commitment ? `${row.commitment.slice(0, 10)}…${row.commitment.slice(-8)}` : "-";
    const sub = row.createdAt ? new Date(row.createdAt).toLocaleString() : "-";
    const isPending = row.status === "pending";
    const extra =
      row.status === "approved" && row.approvedTx
        ? `<div class="dash-meta">Tx: ${row.approvedTx.slice(0, 14)}…</div>`
        : "";

    tr.innerHTML = `
      <td>${escapeHtml(row.fullName)}</td>
      <td><code>${escapeHtml(row.cnic)}</code></td>
      <td>${escapeHtml(row.phone)}</td>
      <td><code title="${escapeHtml(row.commitment)}">${short}</code>${extra}</td>
      <td>${sub}</td>
      <td class="dash-actions"></td>
    `;
    const actions = tr.querySelector(".dash-actions");
    if (isPending) {
      const approve = document.createElement("button");
      approve.className = "btn btn-primary btn-sm";
      approve.textContent = "Approve (wallet)";
      approve.onclick = () => approveRow(row);
      const reject = document.createElement("button");
      reject.className = "btn btn-outline btn-sm";
      reject.textContent = "Reject";
      reject.onclick = () => rejectRow(row.id);
      actions.appendChild(approve);
      actions.appendChild(reject);
    } else {
      actions.innerHTML = `<span class="dash-meta">${row.status}</span>`;
    }
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function rejectRow(id) {
  try {
    await apiAction({ action: "reject", id });
    showToast("Rejected", "ok");
    await loadTable();
  } catch (e) {
    showToast(e.message, "err");
  }
}

async function approveRow(row) {
  try {
    if (!signer) throw new Error("Connect wallet first");
    const regAddr = document.getElementById("registryAddress").value.trim();
    if (!regAddr) throw new Error("Set VoterRegistry address");

    showToast("Confirm in MetaMask…", "pending");
    const reg = new ethers.Contract(regAddr, registryAbi, signer);
    const tx = await reg.addEligibleVoters([row.commitment]);
    await tx.wait();

    await apiAction({ action: "mark-approved", id: row.id, approvedTx: tx.hash });
    showToast("Approved on-chain", "ok");
    await loadTable();
  } catch (e) {
    showToast(e?.reason || e?.message || String(e), "err");
  }
}

document.getElementById("loadPending").onclick = async () => {
  try {
    document.getElementById("dashStatus").textContent = "Loading…";
    await loadTable();
    document.getElementById("dashStatus").textContent = "List updated.";
    showToast("Applications loaded", "ok");
  } catch (e) {
    document.getElementById("dashStatus").textContent = e.message;
    showToast(e.message, "err");
  }
};

document.getElementById("statusFilter").onchange = () => {
  loadTable().catch((e) => showToast(e.message, "err"));
};

loadSettings();

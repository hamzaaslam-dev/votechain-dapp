const registryAbi = ["function addEligibleVoters(bytes32[] commitments) external"];

const SESSION_KEY = "votechain_admin_session";

let provider;
let signer;
let userAddress;
let toastTimer;
let deployedCfg;

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

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSession(obj) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function sessionStillValid(sess) {
  if (!sess || !sess.message) return false;
  const exp = adminSessionExpiresAt(sess.message);
  return exp > Math.floor(Date.now() / 1000) + 30;
}

async function ensureSignedSession() {
  if (!signer || !userAddress) throw new Error("Connect wallet first");
  if (!deployedCfg || !deployedCfg.registry) throw new Error("Missing deployed-addresses.json — run deploy first");

  let sess = readSession();
  if (sess && sessionStillValid(sess) && sess.registryAddress?.toLowerCase() === deployedCfg.registry.toLowerCase()) {
    return sess;
  }

  const net = await provider.getNetwork();
  const { message } = buildAdminSessionMessage(deployedCfg.registry, userAddress, net.chainId);
  showToast("Sign the message in MetaMask…", "pending");
  const signature = await signer.signMessage(message);
  sess = { message, signature, registryAddress: deployedCfg.registry };
  writeSession(sess);
  showToast("Session saved for ~1 hour", "ok");
  return sess;
}

function authBody(extra) {
  const sess = readSession();
  if (!sess || !sessionStillValid(sess)) throw new Error("Session expired — click Sign & load again");
  return {
    ...extra,
    registryAddress: sess.registryAddress,
    message: sess.message,
    signature: sess.signature
  };
}

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
    document.getElementById("btnSignAndLoad").disabled = false;
    showToast("Wallet connected", "ok");
  } catch (e) {
    btn.innerHTML = orig;
    btn.disabled = false;
    showToast(e.message, "err");
  }
};

document.getElementById("btnClearSession").onclick = () => {
  clearSession();
  showToast("Signed session cleared", "ok");
};

document.getElementById("btnSignAndLoad").onclick = async () => {
  const btn = document.getElementById("btnSignAndLoad");
  const orig = btn.innerHTML;
  try {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Signing…`;
    await ensureSignedSession();
    document.getElementById("registryAddress").value = deployedCfg.registry;
    await loadTable();
    document.getElementById("dashStatus").textContent = "Queue loaded.";
    showToast("Applications loaded", "ok");
  } catch (e) {
    showToast(e?.reason || e?.message || String(e), "err");
    document.getElementById("dashStatus").textContent = e?.message || String(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
};

async function apiAction(body) {
  const res = await fetch("/api/admin/application-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authBody(body))
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText);
  return data;
}

async function loadTable() {
  const sess = readSession();
  if (!sess || !sessionStillValid(sess)) {
    throw new Error("Sign & load first");
  }

  const status = document.getElementById("statusFilter").value;
  const res = await fetch("/api/admin/applications-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authBody({ status }))
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
    const regAddr = deployedCfg?.registry || document.getElementById("registryAddress").value.trim();
    if (!regAddr) throw new Error("No registry");

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

document.getElementById("statusFilter").onchange = () => {
  loadTable().catch((e) => showToast(e.message, "err"));
};

(async function init() {
  const hint = document.getElementById("deployHint");
  deployedCfg = await loadDeployedAddresses();
  if (!deployedCfg) {
    if (hint) hint.textContent = "Run npm run deploy:local or deploy:sepolia first — then refresh. No manual addresses.";
    return;
  }
  document.getElementById("registryAddress").value = deployedCfg.registry;
  if (hint) {
    hint.textContent = `Registry loaded for chain ${deployedCfg.chainId}. Connect the admin wallet on that network, then Sign & load.`;
  }
})();

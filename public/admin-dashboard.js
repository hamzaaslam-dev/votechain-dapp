/* global solanaWeb3 */
const SESSION_KEY = "votechain_admin_session";

let walletPubkey = null;
let deployedCfg = null;
let programId = null;
let toastTimer = null;

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
    return raw ? JSON.parse(raw) : null;
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
  if (!sess?.message) return false;
  return adminSessionExpiresAt(sess.message) > Math.floor(Date.now() / 1000) + 30;
}

function writeBytes32(buf, off, arr) {
  for (let i = 0; i < 32; i++) buf[off + i] = arr[i];
}

function hexToBytes32Array(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = [];
  for (let i = 0; i < 64; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
}

async function sendProgramTx(instruction) {
  const phantom = getPhantom();
  const connection = solanaConnection();
  const tx = new solanaWeb3.Transaction().add(instruction);
  tx.feePayer = walletPubkey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const signed = await phantom.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

async function ensureSignedSession() {
  if (!walletPubkey) throw new Error("Connect Phantom first");
  if (!deployedCfg?.ballot) {
    throw new Error(
      "Missing solana-deployed.json — deploy Solana (see solana/README.md), copy to public/, commit, and redeploy Vercel."
    );
  }

  let sess = readSession();
  if (
    sess &&
    sessionStillValid(sess) &&
    sess.ballotAddress === deployedCfg.ballot &&
    sess.wallet === walletPubkey.toBase58()
  ) {
    return sess;
  }

  const { message } = buildAdminSessionMessage(deployedCfg.ballot, walletPubkey.toBase58());
  showToast("Sign admin session in Phantom…", "pending");
  const phantom = getPhantom();
  const signed = await phantom.signMessage(new TextEncoder().encode(message));
  sess = {
    message,
    signature: signatureToBase64(signed.signature),
    wallet: walletPubkey.toBase58(),
    ballotAddress: deployedCfg.ballot
  };
  writeSession(sess);
  showToast("Session saved (~1 hour)", "ok");
  return sess;
}

function authBody(extra) {
  const sess = readSession();
  if (!sess || !sessionStillValid(sess)) throw new Error("Session expired — Sign & load again");
  return {
    ...extra,
    ballotAddress: sess.ballotAddress,
    wallet: sess.wallet,
    message: sess.message,
    signature: sess.signature
  };
}

document.getElementById("connectWallet").onclick = async () => {
  const btn = document.getElementById("connectWallet");
  const orig = btn.innerHTML;
  try {
    btn.disabled = true;
    const phantom = getPhantom();
    const resp = await phantom.connect();
    walletPubkey = new solanaWeb3.PublicKey(resp.publicKey.toString());
    btn.innerHTML = `<span>✅</span> ${walletPubkey.toBase58().slice(0, 6)}…${walletPubkey.toBase58().slice(-4)}`;
    btn.disabled = false;
    document.getElementById("dashStatus").textContent = `Phantom: ${walletPubkey.toBase58()}`;
    document.getElementById("btnSignAndLoad").disabled = false;
    showToast("Phantom connected", "ok");
  } catch (e) {
    btn.innerHTML = orig;
    btn.disabled = false;
    showToast(e.message, "err");
  }
};

document.getElementById("btnClearSession").onclick = () => {
  clearSession();
  showToast("Session cleared", "ok");
};

document.getElementById("btnSignAndLoad").onclick = async () => {
  const btn = document.getElementById("btnSignAndLoad");
  const orig = btn.innerHTML;
  try {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Signing…`;
    await ensureSignedSession();
    await loadTable();
    document.getElementById("dashStatus").textContent = "Queue loaded.";
    showToast("Applications loaded", "ok");
  } catch (e) {
    showToast(e.message, "err");
    document.getElementById("dashStatus").textContent = e.message;
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
    const token = row.commitmentHex || row.blindedToken;
    const short = token ? `${String(token).slice(0, 10)}…${String(token).slice(-8)}` : "-";
    const sub = row.createdAt ? new Date(row.createdAt).toLocaleString() : "-";
    const isPending = row.status === "pending";
    const extra =
      row.status === "approved" && row.approvedTx
        ? `<div class="dash-meta">Tx: ${escapeHtml(row.approvedTx.slice(0, 16))}…</div>`
        : "";

    tr.innerHTML = `
      <td>${escapeHtml(row.fullName)}</td>
      <td><code>${escapeHtml(row.cnic)}</code></td>
      <td>${escapeHtml(row.phone)}</td>
      <td><code title="${escapeHtml(token || "")}">${short}</code>${extra}</td>
      <td>${sub}</td>
      <td class="dash-actions"></td>
    `;
    const actions = tr.querySelector(".dash-actions");
    if (isPending) {
      const approve = document.createElement("button");
      approve.className = "btn btn-primary btn-sm";
      approve.textContent = "Approve";
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
    if (!row.commitmentHex) {
      throw new Error("Old row — voter must whitelist again with Phantom");
    }
    if (!walletPubkey || !programId) throw new Error("Connect Phantom and load deploy config");

    const commitment = hexToBytes32Array(row.commitmentHex);
    const ballotPk = new solanaWeb3.PublicKey(deployedCfg.ballot);
    const data = buildIxData("add_eligible", () => {
      const buf = new Uint8Array(32);
      writeBytes32(buf, 0, commitment);
      return buf;
    });
    const ix = new solanaWeb3.TransactionInstruction({
      keys: [
        { pubkey: walletPubkey, isSigner: true, isWritable: true },
        { pubkey: ballotPk, isSigner: false, isWritable: true }
      ],
      programId,
      data
    });

    showToast("Sign add_eligible in Phantom…", "pending");
    const sig = await sendProgramTx(ix);
    await apiAction({ action: "mark-approved", id: row.id, approvedTx: sig });
    showToast("Whitelisted on-chain", "ok");
    await loadTable();
  } catch (e) {
    console.error("Approve transaction failed:", e);
    let errorMsg = e.message || String(e);
    if (typeof e.getLogs === "function") {
      const logs = e.getLogs();
      console.error("Transaction Simulation/Execution Logs:\n", logs.join("\n"));
    } else if (e.logs) {
      console.error("Transaction Logs:\n", e.logs.join("\n"));
    }
    showToast(errorMsg, "err");
  }
}

document.getElementById("statusFilter").onchange = () => {
  loadTable().catch((e) => showToast(e.message, "err"));
};

(async function init() {
  const hint = document.getElementById("deployHint");
  deployedCfg = await loadDeployedAddresses();
  if (!deployedCfg?.ballot) {
    if (hint) hint.textContent = "Deploy Solana program and copy public/solana-deployed.json (see solana/README.md).";
    return;
  }
  programId = new solanaWeb3.PublicKey(deployedCfg.programId);
  if (hint) {
    hint.textContent = `Ballot admin must match on-chain admin for ${deployedCfg.ballot.slice(0, 8)}… on Devnet.`;
  }
})();

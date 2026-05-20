/* global solanaWeb3, BlindSignature */
let walletPubkey = null;
let deployed = null;
let programId = null;

let adminE = null;
let adminN = null;
let adminKeyLoadPromise = null;
let votingToken = localStorage.getItem('votingToken') || null;
let blindingR = localStorage.getItem('blindingR') ? BigInt(localStorage.getItem('blindingR')) : null;
let signedToken = localStorage.getItem('signedToken') || null;

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

function writeU8(buf, off, v) {
  buf[off] = v & 0xff;
}
function writeBytes32(buf, off, arr) {
  for (let i = 0; i < 32; i++) buf[off + i] = arr[i];
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

document.getElementById("connectWallet").onclick = async () => {
  const btn = document.getElementById("connectWallet");
  const orig = btn.innerHTML;
  try {
    btn.disabled = true;
    const phantom = getPhantom();
    const resp = await phantom.connect();
    walletPubkey = new solanaWeb3.PublicKey(resp.publicKey.toString());
    
    // Change button text to connected wallet address
    btn.innerHTML = `<span>✅</span> ${walletPubkey.toBase58().slice(0, 6)}…${walletPubkey.toBase58().slice(-4)}`;
    btn.disabled = false;
    
    document.getElementById("walletLine").textContent =
      `Phantom: ${walletPubkey.toBase58()} (not stored in applications)`;
    document.getElementById("networkBadge").textContent = "Devnet";
    document.getElementById("networkBadge").classList.add("connected");
    showToast("Phantom connected", "ok");
  } catch (e) {
    btn.innerHTML = orig;
    btn.disabled = false;
    showToast(e.message, "err");
  }
};

document.getElementById("btnSignIdentity").onclick = async () => {
  try {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    votingToken = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('votingToken', votingToken);
    signedToken = null;
    blindingR = null;
    localStorage.removeItem('signedToken');
    localStorage.removeItem('blindingR');
    
    document.getElementById("commitmentHex").textContent = "Generated locally: " + votingToken.slice(0,10) + "...";
    document.getElementById("nullifierHex").textContent = "N/A (Blind Signatures)";
    document.getElementById("identityBox").classList.remove("hidden");
    showToast("Voting token generated locally", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

document.getElementById("btnVerifyCnic").onclick = async () => {
  const out = document.getElementById("cnicResult");
  out.textContent = "";
  try {
    const cnic = document.getElementById("applyCnic").value.trim();
    if (!/^\d{13}$/.test(cnic)) throw new Error("CNIC must be 13 digits");
    const res = await fetch("/api/verify-cnic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnic })
    });
    const data = await res.json();
    out.textContent = data.eligible ? "CNIC is on the demo allowlist." : "CNIC not on demo allowlist.";
    showToast(data.eligible ? "Eligible" : "Not on list", data.eligible ? "ok" : "err");
  } catch (e) {
    showToast(e.message, "err");
  }
};

function loadBlindingR() {
  if (blindingR) return blindingR;
  const raw = localStorage.getItem("blindingR");
  if (!raw) return null;
  blindingR = BigInt(raw);
  return blindingR;
}

async function ensureAdminPublicKey(forceRefresh) {
  if (forceRefresh) {
    adminE = null;
    adminN = null;
    adminKeyLoadPromise = null;
  }
  if (adminE && adminN) return;
  if (adminKeyLoadPromise) {
    await adminKeyLoadPromise;
    if (adminE && adminN) return;
  }
  const res = await fetch("/api/public-key", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || data.N == null || data.E == null) {
    throw new Error(data.message || "Could not load admin public key. Is the API running?");
  }
  adminN = BigInt(data.N);
  adminE = BigInt(data.E);
}

async function unblindApprovedToken(signedBlinded) {
  await ensureAdminPublicKey(true);
  const r = loadBlindingR();
  if (!r) throw new Error("Blinding factor R missing — submit a new application on this browser.");
  if (!votingToken) throw new Error("Voting token missing — generate a token and apply again.");
  const unblinded = BlindSignature.unblind(BigInt(String(signedBlinded)), r, adminN);
  const ok = await BlindSignature.verify(unblinded, votingToken, adminE, adminN);
  if (!ok) {
    throw new Error(
      "Signature does not match this token. Admin may have re-approved with a new key — apply again."
    );
  }
  signedToken = unblinded.toString();
  localStorage.setItem("signedToken", signedToken);
  return signedToken;
}

async function ensureReadyToVote() {
  if (!votingToken) throw new Error("Generate a voting token and apply first.");
  await ensureAdminPublicKey(true);
  const r = loadBlindingR();
  if (!r) throw new Error("Apply first on this browser (blinding factor R is stored locally).");

  if (signedToken) {
    const ok = await BlindSignature.verify(BigInt(signedToken), votingToken, adminE, adminN);
    if (ok) return;
  }

  const cnic = localStorage.getItem("applyCnic") || document.getElementById("applyCnic").value.trim();
  if (!cnic) throw new Error("Check status after approval to finish signing your token.");

  const res = await fetch("/api/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cnic })
  });
  const data = await res.json().catch(() => ({}));
  if (data.status !== "approved" || !data.signedToken) {
    throw new Error(`Not ready to vote (status: ${data.status || "unknown"}). Wait for admin approval.`);
  }
  await unblindApprovedToken(data.signedToken);
}

document.getElementById("btnApply").onclick = async () => {
  try {
    if (!votingToken) throw new Error("Generate token first");
    await ensureAdminPublicKey();

    const fullName = document.getElementById("applyFullName").value.trim();
    const phone = document.getElementById("applyPhone").value.trim();
    const cnic = document.getElementById("applyCnic").value.trim();
    if (!/^\d{13}$/.test(cnic)) throw new Error("CNIC must be 13 digits");

    const { blinded, r } = await BlindSignature.blind(votingToken, adminN, adminE);
    blindingR = r;
    localStorage.setItem('blindingR', blindingR.toString());
    localStorage.setItem('applyCnic', cnic);
    signedToken = null;
    localStorage.removeItem('signedToken');

    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        phone,
        cnic,
        blindedToken: blinded.toString()
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Apply failed");
    document.getElementById("applyResult").textContent =
      `Submitted (${data.id}). Admin will review your application.`;
    showToast("Application sent", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

const btnCheckStatus = document.getElementById("btnCheckStatus");
if (btnCheckStatus) {
  btnCheckStatus.onclick = async () => {
    try {
      const cnic = localStorage.getItem('applyCnic') || document.getElementById("applyCnic").value.trim();
      if (!cnic) throw new Error("Enter CNIC to check status");

      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnic })
      });
      const data = await res.json();
      if (data.status === "approved" && data.signedToken) {
        await unblindApprovedToken(data.signedToken);
        showToast("Token signed and unblinded successfully! You can vote now.", "ok");
        document.getElementById("applyResult").textContent = "Approved and Signed! Ready to Vote.";
      } else {
        showToast(`Status: ${data.status}`, "info");
      }
    } catch (e) {
      showToast(e.message, "err");
    }
  };
}

document.getElementById("btnVote").onclick = async () => {
  try {
    await ensureReadyToVote();
    const proposalId = Number(document.getElementById("proposalId").value || 0);
    
    showToast("Submitting vote gaslessly...", "pending");
    const res = await fetch("/api/relay-vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        votingToken,
        signature: signedToken,
        proposalId
      })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Vote failed");
    
    document.getElementById("voteResult").textContent = `Vote TxId: ${data.txId}`;
    showToast("Vote submitted to Solana!", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

adminKeyLoadPromise = ensureAdminPublicKey()
  .then(() => console.log("Admin public key loaded"))
  .catch((e) => {
    console.error("Failed to load admin public key", e);
    showToast("Admin public key failed to load — retry after refreshing", "err");
  });

(async function init() {
  deployed = await loadDeployedAddresses();
  const hint = document.getElementById("deployHint");
  if (!deployed?.programId) {
    if (hint) {
      hint.textContent =
        "Run Solana deploy (see solana/README.md), then copy target/deployed-devnet.json → public/solana-deployed.json";
    }
    return;
  }
  programId = new solanaWeb3.PublicKey(deployed.programId);
  if (hint) {
    hint.textContent = `Devnet · program ${deployed.programId.slice(0, 8)}… · ballot ${deployed.ballot.slice(0, 8)}…`;
  }
})();

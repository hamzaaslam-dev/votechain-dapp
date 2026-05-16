/* global solanaWeb3, BlindSignature */
let walletPubkey = null;
let deployed = null;
let programId = null;

let adminE = null;
let adminN = null;
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
  try {
    const phantom = getPhantom();
    const resp = await phantom.connect();
    walletPubkey = new solanaWeb3.PublicKey(resp.publicKey.toString());
    document.getElementById("walletLine").textContent =
      `Phantom: ${walletPubkey.toBase58()} (not stored in applications)`;
    document.getElementById("networkBadge").textContent = "Devnet";
    document.getElementById("networkBadge").classList.add("connected");
    showToast("Phantom connected", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

document.getElementById("btnSignIdentity").onclick = async () => {
  try {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    votingToken = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('votingToken', votingToken);
    
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

document.getElementById("btnApply").onclick = async () => {
  try {
    if (!votingToken) throw new Error("Generate token first");
    if (!adminE || !adminN) throw new Error("Admin public key not loaded yet");

    const fullName = document.getElementById("applyFullName").value.trim();
    const phone = document.getElementById("applyPhone").value.trim();
    const cnic = document.getElementById("applyCnic").value.trim();
    if (!/^\d{13}$/.test(cnic)) throw new Error("CNIC must be 13 digits");

    const { blinded, r } = await BlindSignature.blind(votingToken, adminN, adminE);
    blindingR = r;
    localStorage.setItem('blindingR', blindingR.toString());
    localStorage.setItem('applyCnic', cnic);

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

document.getElementById("btnCheckStatus") = document.getElementById("btnCheckStatus") || document.createElement("button"); // Add dynamic button later in HTML
document.getElementById("btnCheckStatus").onclick = async () => {
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
      if (!blindingR) throw new Error("Blinding factor R not found in local storage");
      const unblinded = BlindSignature.unblind(BigInt(data.signedToken), blindingR, adminN);
      signedToken = unblinded.toString();
      localStorage.setItem('signedToken', signedToken);
      showToast("Token signed and unblinded successfully! You can vote now.", "ok");
      document.getElementById("applyResult").textContent = "Approved and Signed! Ready to Vote.";
    } else {
      showToast(`Status: ${data.status}`, "info");
    }
  } catch (e) {
    showToast(e.message, "err");
  }
};

document.getElementById("btnVote").onclick = async () => {
  try {
    if (!votingToken || !signedToken) throw new Error("You must apply and be approved to get a signed token first.");
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

(async function init() {
  try {
    const res = await fetch("/api/public-key");
    const data = await res.json();
    adminE = BigInt(data.E);
    adminN = BigInt(data.N);
    console.log("Loaded Admin Public Key");
  } catch (e) {
    console.error("Failed to load admin key", e);
  }

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

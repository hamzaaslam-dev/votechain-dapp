/* global solanaWeb3 */
let walletPubkey = null;
let identity = null;
let deployed = null;
let programId = null;

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
    const phantom = getPhantom();
    if (!walletPubkey) await document.getElementById("connectWallet").onclick();
    const signed = await phantom.signMessage(SOLANA_VOTE_SIGN_MESSAGE);
    const sig = signed.signature;
    const commitment = await commitmentFromSignature(sig);
    const nullifier = await nullifierFromSignature(sig);
    const commitmentHex = bytesToHex32(commitment);
    identity = { commitment, nullifier, commitmentHex };
    document.getElementById("commitmentHex").textContent = commitmentHex;
    document.getElementById("nullifierHex").textContent = bytesToHex32(nullifier);
    document.getElementById("identityBox").classList.remove("hidden");
    showToast("Voting keys derived", "ok");
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
    if (!identity) throw new Error("Sign to derive keys first");
    const fullName = document.getElementById("applyFullName").value.trim();
    const phone = document.getElementById("applyPhone").value.trim();
    const cnic = document.getElementById("applyCnic").value.trim();
    if (!/^\d{13}$/.test(cnic)) throw new Error("CNIC must be 13 digits");
    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        phone,
        cnic,
        commitment: identity.commitmentHex
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Apply failed");
    document.getElementById("applyResult").textContent =
      `Submitted (${data.id}). Admin will add your commitment on-chain.`;
    showToast("Application sent", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

document.getElementById("btnVote").onclick = async () => {
  try {
    if (!identity) throw new Error("Sign to derive keys first");
    if (!programId || !deployed?.ballot) throw new Error("Deploy config missing — see deploy hint");
    const ballotPk = new solanaWeb3.PublicKey(deployed.ballot);
    const proposalId = Number(document.getElementById("proposalId").value || 0);
    const data = buildIxData("vote", () => {
      const buf = new Uint8Array(1 + 32 + 32);
      writeU8(buf, 0, proposalId);
      writeBytes32(buf, 1, identity.commitment);
      writeBytes32(buf, 33, identity.nullifier);
      return buf;
    });
    const ix = new solanaWeb3.TransactionInstruction({
      keys: [{ pubkey: ballotPk, isSigner: false, isWritable: true }],
      programId,
      data
    });
    showToast("Confirm in Phantom…", "pending");
    const sig = await sendProgramTx(ix);
    document.getElementById("voteResult").textContent = `Vote: ${sig}`;
    showToast("Vote submitted", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

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

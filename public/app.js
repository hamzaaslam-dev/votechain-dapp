const ballotAbi = [
  "function vote(uint256 proposalId, bytes32 commitment, bytes32 nullifierHash) external",
  "function proposalCount() external view returns (uint256)",
  "function getProposal(uint256 proposalId) external view returns (bytes32 name, uint256 voteCount)",
  "function nullifierUsed(bytes32 nullifier) external view returns (bool)"
];

let provider, signer, userAddress;
let toastTimer = null;

// ===== Toast =====
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  const toastIcon = document.getElementById("toastIcon");

  const icons = { ok: "✅", err: "❌", info: "ℹ️", pending: "⏳" };
  toastIcon.textContent = icons[type] || "ℹ️";
  toastMsg.textContent = message;

  toast.className = `toast show toast-${type}`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, type === "err" ? 6000 : 4000);
}

// ===== Step indicator =====
function setStep(num) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step-indicator-${i}`);
    el.classList.remove("active", "done");
    if (i < num) el.classList.add("done");
    else if (i === num) el.classList.add("active");
  }
}

// ===== Helpers =====
function getBallot() {
  const address = document.getElementById("ballotAddress").value.trim();
  if (!address) throw new Error("Paste the ballot contract address first");
  if (!signer) throw new Error("Connect MetaMask wallet first");
  return new ethers.Contract(address, ballotAbi, signer);
}

function getInputs() {
  const cnic = document.getElementById("cnic").value.trim();
  const secret = document.getElementById("secret").value.trim();
  if (!/^\d{13}$/.test(cnic)) throw new Error("CNIC must be exactly 13 digits");
  if (!secret) throw new Error("Secret passphrase is required");
  return { cnic, secret };
}

function generateCommitmentAndNullifier() {
  const { cnic, secret } = getInputs();
  const commitment = ethers.keccak256(ethers.toUtf8Bytes(`commitment:${cnic}:${secret}`));
  const nullifier = ethers.keccak256(ethers.toUtf8Bytes(`nullifier:${cnic}:${secret}`));

  document.getElementById("commitmentText").textContent = commitment;
  document.getElementById("nullifierText").textContent = nullifier;
  document.getElementById("commitmentBox").classList.remove("hidden");
  return { commitment, nullifier };
}

function setButtonLoading(btn, loading, originalHTML) {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Processing…`;
  } else {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

// ===== Connect wallet =====
document.getElementById("connectWallet").onclick = async () => {
  const btn = document.getElementById("connectWallet");
  const orig = btn.innerHTML;

  try {
    if (!window.ethereum) throw new Error("MetaMask not detected. Please install it.");
    setButtonLoading(btn, true, orig);

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    const network = await provider.getNetwork();
    const chainName = network.chainId === 31337n ? "Hardhat Local" :
                      network.chainId === 11155111n ? "Sepolia" :
                      `Chain ${network.chainId}`;

    document.getElementById("networkBadge").textContent = chainName;
    document.getElementById("networkBadge").classList.add("connected");

    const short = `${userAddress.slice(0, 6)}…${userAddress.slice(-4)}`;
    document.getElementById("walletShort").textContent = short;
    document.getElementById("walletFull").textContent = userAddress;
    document.getElementById("walletCard").classList.remove("hidden");

    btn.innerHTML = `<span>✅</span> ${short}`;
    btn.disabled = false;

    setStep(2);
    showToast("Wallet connected: " + short, "ok");
  } catch (err) {
    setButtonLoading(btn, false, orig);
    showToast(err.message, "err");
  }
};

// ===== Generate commitment =====
document.getElementById("generate").onclick = () => {
  try {
    generateCommitmentAndNullifier();
    setStep(3);
    showToast("Commitment & nullifier generated locally (never sent to server)", "ok");
  } catch (err) {
    showToast(err.message, "err");
  }
};

// ===== Verify CNIC =====
document.getElementById("verifyCnic").onclick = async () => {
  const btn = document.getElementById("verifyCnic");
  const orig = btn.innerHTML;
  const resultEl = document.getElementById("eligibilityResult");

  try {
    const { cnic } = getInputs();
    setButtonLoading(btn, true, orig);

    const response = await fetch("/api/verify-cnic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnic })
    });
    const data = await response.json();

    resultEl.classList.remove("hidden", "ok", "err");

    if (data.eligible) {
      resultEl.classList.add("ok");
      resultEl.innerHTML = "✅ CNIC is eligible to vote";
      showToast("CNIC is eligible", "ok");
    } else {
      resultEl.classList.add("err");
      resultEl.innerHTML = "❌ CNIC not in eligible list";
      showToast("CNIC not found in eligible list", "err");
    }
  } catch (err) {
    showToast(err.message, "err");
  } finally {
    setButtonLoading(btn, false, orig);
  }
};

// ===== Register commitment =====
document.getElementById("registerCommitment").onclick = async () => {
  const btn = document.getElementById("registerCommitment");
  const orig = btn.innerHTML;

  try {
    const { commitment } = generateCommitmentAndNullifier();
    setButtonLoading(btn, true, orig);
    showToast("Sending registration transaction…", "pending");

    const response = await fetch("/api/admin/add-commitment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitment })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "Registration failed");

    setStep(4);
    showToast(`Registered on-chain! Tx: ${data.txHash.slice(0, 16)}…`, "ok");
  } catch (err) {
    showToast(err.message, "err");
  } finally {
    setButtonLoading(btn, false, orig);
  }
};

// ===== Proposal picker =====
document.querySelectorAll(".proposal-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".proposal-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("proposalId").value = btn.dataset.id;
  };
});

// ===== Cast vote =====
document.getElementById("castVote").onclick = async () => {
  const btn = document.getElementById("castVote");
  const orig = btn.innerHTML;
  const txBox = document.getElementById("txBox");
  const txLink = document.getElementById("txLink");

  try {
    const { commitment, nullifier } = generateCommitmentAndNullifier();
    const proposalId = Number(document.getElementById("proposalId").value);
    const ballot = getBallot();

    setButtonLoading(btn, true, orig);
    showToast("Checking if already voted…", "pending");

    const alreadyUsed = await ballot.nullifierUsed(nullifier);
    if (alreadyUsed) throw new Error("You have already voted with this identity");

    showToast("Please confirm the transaction in MetaMask…", "pending");
    const tx = await ballot.vote(proposalId, commitment, nullifier);

    txBox.classList.remove("hidden");
    txLink.textContent = tx.hash;
    txLink.href = `https://sepolia.etherscan.io/tx/${tx.hash}`;

    showToast("Transaction sent! Waiting for confirmation…", "pending");
    await tx.wait();

    setStep(5);
    showToast("Vote confirmed on blockchain!", "ok");
  } catch (err) {
    const msg = err?.reason || err?.message || "Unknown error";
    showToast(msg, "err");
  } finally {
    setButtonLoading(btn, false, orig);
  }
};

// ===== Load results =====
document.getElementById("loadResults").onclick = async () => {
  const btn = document.getElementById("loadResults");
  const orig = btn.innerHTML;
  const barsEl = document.getElementById("resultsBars");

  try {
    const ballot = getBallot();
    setButtonLoading(btn, true, orig);
    showToast("Loading on-chain results…", "info");

    const count = Number(await ballot.proposalCount());
    const proposals = [];
    let maxVotes = 0;

    for (let i = 0; i < count; i++) {
      const [rawName, voteCount] = await ballot.getProposal(i);
      const name = ethers.decodeBytes32String(rawName);
      const votes = Number(voteCount);
      proposals.push({ name, votes });
      if (votes > maxVotes) maxVotes = votes;
    }

    barsEl.innerHTML = "";

    proposals.forEach((p, i) => {
      const isWinner = maxVotes > 0 && p.votes === maxVotes;
      const pct = maxVotes > 0 ? ((p.votes / maxVotes) * 100).toFixed(1) : 0;

      const row = document.createElement("div");
      row.className = "result-row";
      row.innerHTML = `
        <div class="result-meta">
          <span class="result-name">${isWinner ? "🏆 " : ""}${p.name}</span>
          <span class="result-votes">${p.votes} vote${p.votes !== 1 ? "s" : ""}</span>
        </div>
        <div class="result-bar-bg">
          <div class="result-bar-fill${isWinner ? " winner" : ""}" style="width:0%" data-pct="${pct}%"></div>
        </div>
      `;
      barsEl.appendChild(row);
    });

    // Animate bars after render
    requestAnimationFrame(() => {
      document.querySelectorAll(".result-bar-fill").forEach(bar => {
        bar.style.width = bar.dataset.pct;
      });
    });

    setStep(5);
    showToast("Results loaded from blockchain", "ok");
  } catch (err) {
    showToast(err.message, "err");
  } finally {
    setButtonLoading(btn, false, orig);
  }
};

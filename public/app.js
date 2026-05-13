const ballotAbi = [
  "function vote(uint256 proposalId, bytes32 commitment, bytes32 nullifierHash) external",
  "function proposalCount() external view returns (uint256)",
  "function getProposal(uint256 proposalId) external view returns (bytes32 name, uint256 voteCount)",
  "function nullifierUsed(bytes32 nullifier) external view returns (bool)",
  "function startVotingNow() external",
  "function admin() view returns (address)",
  "function startTime() view returns (uint64)",
  "function endTime() view returns (uint64)"
];

const registryAbi = [
  "function admin() view returns (address)",
  "function addEligibleVoters(bytes32[] commitments) external",
  "function isEligible(bytes32 commitment) view returns (bool)"
];

const factoryAbi = [
  "function admin() view returns (address)",
  "function createElection(address registry, bytes32[] proposalNames, uint64 startTime, uint64 endTime) returns (address ballot)"
];

let provider, signer, userAddress;
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
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, type === "err" ? 6000 : 4000);
}

function setStep(num) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step-indicator-${i}`);
    el.classList.remove("active", "done");
    if (i < num) el.classList.add("done");
    else if (i === num) el.classList.add("active");
  }
}

async function explorerTxUrl(hash) {
  if (!provider || !hash) return "#";
  const n = await provider.getNetwork();
  if (n.chainId === 31337n) return `#local-tx-${hash}`;
  if (n.chainId === 11155111n) return `https://sepolia.etherscan.io/tx/${hash}`;
  return `https://etherscan.io/tx/${hash}`;
}

async function setTxLink(el, hash) {
  el.textContent = hash;
  el.href = await explorerTxUrl(hash);
}

function getRegistryAddress() {
  const a = document.getElementById("registryAddress").value.trim();
  if (!a) throw new Error("Paste VoterRegistry address in Admin section");
  return a;
}

function getFactoryAddress() {
  const a = document.getElementById("factoryAddress").value.trim();
  if (!a) throw new Error("Paste ElectionFactory address in Admin section");
  return a;
}

function getBallot() {
  const address = document.getElementById("ballotAddress").value.trim();
  if (!address) throw new Error("Paste the ballot contract address first");
  if (!signer) throw new Error("Connect MetaMask wallet first");
  return new ethers.Contract(address, ballotAbi, signer);
}

function getBallotReadOnly() {
  const address = document.getElementById("ballotAddress").value.trim();
  if (!address || !provider) return null;
  return new ethers.Contract(address, ballotAbi, provider);
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
  const adminIn = document.getElementById("adminCommitmentInput");
  if (adminIn && !adminIn.value.trim()) adminIn.value = commitment;
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

function parseProposalNamesCsv(csv) {
  const parts = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) throw new Error("Enter at least two candidate names, comma-separated");
  return parts.map((p) => {
    if (p.length > 31) throw new Error(`Name too long (max 31 chars): ${p}`);
    return ethers.encodeBytes32String(p);
  });
}

function datetimeLocalToUnix(elId) {
  const el = document.getElementById(elId);
  const v = el.value;
  if (!v) throw new Error("Pick date and time for " + elId);
  const sec = Math.floor(new Date(v).getTime() / 1000);
  if (!Number.isFinite(sec)) throw new Error("Invalid date/time");
  return sec;
}

async function refreshAdminRoleBanner() {
  const banner = document.getElementById("adminRoleBanner");
  const text = document.getElementById("adminRoleText");
  banner.classList.remove("ok", "warn");

  if (!provider || !userAddress) {
    text.textContent = "Connect wallet first.";
    return;
  }

  let reg = "";
  let fac = "";
  try {
    const rAddr = document.getElementById("registryAddress").value.trim();
    const fAddr = document.getElementById("factoryAddress").value.trim();
    if (rAddr) {
      const regC = new ethers.Contract(rAddr, registryAbi, provider);
      const a = await regC.admin();
      reg = a.toLowerCase() === userAddress.toLowerCase() ? "Registry admin ✓" : "Not registry admin";
    }
    if (fAddr) {
      const facC = new ethers.Contract(fAddr, factoryAbi, provider);
      const a = await facC.admin();
      fac = a.toLowerCase() === userAddress.toLowerCase() ? "Factory admin ✓" : "Not factory admin";
    }
    if (!rAddr && !fAddr) {
      text.textContent = "Paste Registry and Factory addresses, then click Check roles.";
      return;
    }
    text.textContent = [reg, fac].filter(Boolean).join(" · ");
    if (reg.includes("✓") || fac.includes("✓")) banner.classList.add("ok");
    else banner.classList.add("warn");
  } catch (e) {
    text.textContent = e.message || "Could not read contracts";
    banner.classList.add("warn");
  }
}

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
    const chainName =
      network.chainId === 31337n ? "Hardhat Local" : network.chainId === 11155111n ? "Sepolia" : `Chain ${network.chainId}`;

    document.getElementById("networkBadge").textContent = chainName;
    document.getElementById("networkBadge").classList.add("connected");

    const short = `${userAddress.slice(0, 6)}…${userAddress.slice(-4)}`;
    document.getElementById("walletShort").textContent = short;
    document.getElementById("walletFull").textContent = userAddress;
    document.getElementById("walletCard").classList.remove("hidden");

    btn.innerHTML = `<span>✅</span> ${short}`;
    btn.disabled = false;

    setStep(2);
    await refreshAdminRoleBanner();
    showToast("Wallet connected: " + short, "ok");
  } catch (err) {
    setButtonLoading(btn, false, orig);
    showToast(err.message, "err");
  }
};

document.getElementById("refreshAdminRole").onclick = async () => {
  try {
    await refreshAdminRoleBanner();
    showToast("Roles refreshed", "ok");
  } catch (e) {
    showToast(e.message, "err");
  }
};

document.getElementById("generate").onclick = () => {
  try {
    generateCommitmentAndNullifier();
    setStep(3);
    showToast("Commitment & nullifier generated locally (never sent to server)", "ok");
  } catch (err) {
    showToast(err.message, "err");
  }
};

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

document.getElementById("registerCommitment").onclick = async () => {
  const btn = document.getElementById("registerCommitment");
  const orig = btn.innerHTML;

  try {
    const { commitment } = generateCommitmentAndNullifier();
    setButtonLoading(btn, true, orig);
    showToast("Sending registration transaction (server key)…", "pending");

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

document.getElementById("registerCommitmentWallet").onclick = async () => {
  const btn = document.getElementById("registerCommitmentWallet");
  const orig = btn.innerHTML;

  try {
    if (!signer) throw new Error("Connect wallet first");
    const { commitment } = generateCommitmentAndNullifier();
    const regAddr = getRegistryAddress();
    const reg = new ethers.Contract(regAddr, registryAbi, signer);

    setButtonLoading(btn, true, orig);
    showToast("Confirm add voter in MetaMask…", "pending");
    const tx = await reg.addEligibleVoters([commitment]);
    await tx.wait();
    setStep(4);
    showToast("Voter added on-chain via your wallet", "ok");
  } catch (err) {
    showToast(err?.reason || err?.message || String(err), "err");
  } finally {
    setButtonLoading(btn, false, orig);
  }
};

document.getElementById("adminAddVoterWallet").onclick = async () => {
  const btn = document.getElementById("adminAddVoterWallet");
  const orig = btn.innerHTML;

  try {
    if (!signer) throw new Error("Connect wallet first");
    let commitment = document.getElementById("adminCommitmentInput").value.trim();
    if (!commitment) {
      ({ commitment } = generateCommitmentAndNullifier());
      document.getElementById("adminCommitmentInput").value = commitment;
    }
    if (!ethers.isHexString(commitment, 32)) throw new Error("Commitment must be a 0x-prefixed 32-byte hash");

    const regAddr = getRegistryAddress();
    const reg = new ethers.Contract(regAddr, registryAbi, signer);

    setButtonLoading(btn, true, orig);
    showToast("Confirm add voter in MetaMask…", "pending");
    const tx = await reg.addEligibleVoters([commitment]);
    await tx.wait();
    showToast("Eligible voter added", "ok");
  } catch (err) {
    showToast(err?.reason || err?.message || String(err), "err");
  } finally {
    setButtonLoading(btn, false, orig);
  }
};

document.getElementById("adminCreateElection").onclick = async () => {
  const btn = document.getElementById("adminCreateElection");
  const orig = btn.innerHTML;
  const out = document.getElementById("createElectionResult");

  try {
    if (!signer) throw new Error("Connect wallet first");
    const names = parseProposalNamesCsv(document.getElementById("electionNames").value);
    const start = datetimeLocalToUnix("electionStart");
    const end = datetimeLocalToUnix("electionEnd");
    if (end <= start) throw new Error("End time must be after start time");

    const regAddr = getRegistryAddress();
    const facAddr = getFactoryAddress();
    const factory = new ethers.Contract(facAddr, factoryAbi, signer);

    setButtonLoading(btn, true, orig);
    out.textContent = "";
    showToast("Confirm create election in MetaMask…", "pending");

    const tx = await factory.createElection(regAddr, names, start, end);
    const receipt = await tx.wait();

    const fac = new ethers.Contract(facAddr, factoryAbi, provider);
    let ballotAddr;
    for (const log of receipt.logs) {
      try {
        const parsed = fac.interface.parseLog(log);
        if (parsed && parsed.name === "ElectionCreated") {
          ballotAddr = parsed.args.ballot;
          break;
        }
      } catch {
        /* skip */
      }
    }

    if (ballotAddr) {
      document.getElementById("ballotAddress").value = ballotAddr;
      out.textContent = `New Ballot: ${ballotAddr}`;
      showToast("Election created — Ballot address filled in Config", "ok");
    } else {
      out.textContent = `Tx: ${receipt.hash} (parse ballot from explorer)`;
      showToast("Election tx confirmed — check receipt for Ballot address", "ok");
    }
  } catch (err) {
    showToast(err?.reason || err?.message || String(err), "err");
  } finally {
    setButtonLoading(btn, false, orig);
  }
};

document.getElementById("adminStartVoting").onclick = async () => {
  const btn = document.getElementById("adminStartVoting");
  const orig = btn.innerHTML;

  try {
    const ballot = getBallot();
    setButtonLoading(btn, true, orig);
    showToast("Confirm start voting in MetaMask…", "pending");
    const tx = await ballot.startVotingNow();
    await tx.wait();
    showToast("Voting window opened (or was already open)", "ok");
  } catch (err) {
    showToast(err?.reason || err?.message || String(err), "err");
  } finally {
    setButtonLoading(btn, false, orig);
  }
};

document.querySelectorAll(".proposal-btn").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".proposal-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("proposalId").value = btn.dataset.id;
  };
});

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
    await setTxLink(txLink, tx.hash);

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

    proposals.forEach((p) => {
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

    requestAnimationFrame(() => {
      document.querySelectorAll(".result-bar-fill").forEach((bar) => {
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

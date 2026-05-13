/**
 * Shared browser helpers: auto-load contract addresses after deploy, admin session message format.
 */
async function loadDeployedAddresses() {
  try {
    const r = await fetch("/deployed-addresses.json", { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function buildAdminSessionMessage(registryAddress, walletAddress, chainId) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    message: `VoteChain admin session\nRegistry:${registryAddress}\nWallet:${walletAddress}\nChain:${String(chainId)}\nExpires:${exp}`,
    expiresAt: exp
  };
}

function adminSessionExpiresAt(message) {
  const m = /Expires:(\d+)/.exec(String(message || ""));
  return m ? Number(m[1]) : 0;
}

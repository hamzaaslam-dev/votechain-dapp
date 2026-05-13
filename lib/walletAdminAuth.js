const { ethers } = require("ethers");

const registryAbi = ["function admin() view returns (address)"];

function parseAdminSessionMessage(message) {
  const lines = String(message || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines[0] !== "VoteChain admin session") return null;
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(":");
    if (idx === -1) continue;
    const key = lines[i].slice(0, idx).trim();
    const val = lines[i].slice(idx + 1).trim();
    out[key] = val;
  }
  return out;
}

/**
 * Verifies personal_sign / signMessage against on-chain VoterRegistry.admin().
 */
async function verifyRegistryAdminSession(registryAddress, message, signature) {
  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    return { ok: false, error: "Invalid registry address" };
  }
  if (!message || !signature) {
    return { ok: false, error: "Missing wallet signature" };
  }

  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch {
    return { ok: false, error: "Invalid signature" };
  }

  const parsed = parseAdminSessionMessage(message);
  if (!parsed || !parsed.Registry || !parsed.Wallet || !parsed.Expires) {
    return { ok: false, error: "Invalid session message" };
  }

  if (parsed.Registry.toLowerCase() !== registryAddress.toLowerCase()) {
    return { ok: false, error: "Message registry does not match request" };
  }
  if (parsed.Wallet.toLowerCase() !== recovered.toLowerCase()) {
    return { ok: false, error: "Signer does not match message wallet" };
  }

  const exp = Number(parsed.Expires);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "Session expired — sign again" };
  }

  const rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const reg = new ethers.Contract(registryAddress, registryAbi, provider);
  let onChainAdmin;
  try {
    onChainAdmin = await reg.admin();
  } catch (e) {
    return { ok: false, error: "Could not read registry admin (check RPC URL on server)" };
  }

  if (onChainAdmin.toLowerCase() !== recovered.toLowerCase()) {
    return { ok: false, error: "Connected wallet is not VoterRegistry admin" };
  }

  if (parsed.Chain) {
    const net = await provider.getNetwork();
    if (String(net.chainId) !== String(parsed.Chain)) {
      return { ok: false, error: "Wrong network for this session" };
    }
  }

  return { ok: true, wallet: recovered };
}

module.exports = {
  verifyRegistryAdminSession,
  parseAdminSessionMessage
};

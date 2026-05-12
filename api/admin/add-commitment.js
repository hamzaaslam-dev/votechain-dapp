const { ethers } = require("ethers");

const voterRegistryAbi = ["function addEligibleVoters(bytes32[] commitments) external"];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      return res.status(400).json({ ok: false, message: "Invalid JSON" });
    }
  }

  try {
    const { commitment } = body || {};
    if (!ethers.isHexString(commitment, 32)) {
      return res.status(400).json({ ok: false, message: "Invalid commitment bytes32" });
    }

    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    const privateKey = process.env.ADMIN_PRIVATE_KEY;
    const registryAddress = process.env.VOTER_REGISTRY_ADDRESS;

    if (!rpcUrl || !privateKey || !registryAddress) {
      return res.status(500).json({
        ok: false,
        message:
          "Server missing SEPOLIA_RPC_URL, ADMIN_PRIVATE_KEY, or VOTER_REGISTRY_ADDRESS"
      });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const registry = new ethers.Contract(registryAddress, voterRegistryAbi, wallet);
    const tx = await registry.addEligibleVoters([commitment]);
    await tx.wait();

    return res.status(200).json({ ok: true, txHash: tx.hash });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Transaction failed" });
  }
};

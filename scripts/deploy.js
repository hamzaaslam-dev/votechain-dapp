const hre = require("hardhat");

function toBytes32(text) {
  return hre.ethers.encodeBytes32String(text);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Registry = await hre.ethers.getContractFactory("VoterRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();

  const Factory = await hre.ethers.getContractFactory("ElectionFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  const now = Math.floor(Date.now() / 1000);
  const startTime = now + 120;
  const endTime = now + 60 * 60 * 24;
  const proposalNames = ["Candidate A", "Candidate B", "Candidate C"].map(toBytes32);

  const tx = await factory.createElection(registryAddress, proposalNames, startTime, endTime);
  const receipt = await tx.wait();

  let ballotAddress;
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed && parsed.name === "ElectionCreated") {
        ballotAddress = parsed.args.ballot;
        break;
      }
    } catch {
      // not our event
    }
  }

  console.log("VoterRegistry:", registryAddress);
  console.log("ElectionFactory:", factoryAddress);
  console.log("Sample Ballot (optional):", ballotAddress);
  console.log("Start time (unix):", startTime);
  console.log("End time (unix):", endTime);
  console.log("");
  console.log("Admin wallet (registry + factory admin):", deployer.address);
  console.log("Create more elections from the app using Factory + your wallet.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

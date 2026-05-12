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

  const now = Math.floor(Date.now() / 1000);
  const startTime = now + 60;
  const endTime = now + 60 * 60 * 24;
  const proposalNames = ["Candidate A", "Candidate B", "Candidate C"].map(toBytes32);

  const Ballot = await hre.ethers.getContractFactory("Ballot");
  const ballot = await Ballot.deploy(
    await registry.getAddress(),
    proposalNames,
    startTime,
    endTime
  );
  await ballot.waitForDeployment();

  console.log("VoterRegistry:", await registry.getAddress());
  console.log("Ballot:", await ballot.getAddress());
  console.log("Start time:", startTime);
  console.log("End time:", endTime);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

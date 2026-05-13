const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Ballot", function () {
  it("allows eligible vote once and blocks second vote", async function () {
    const [admin, voter] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("VoterRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const now = Math.floor(Date.now() / 1000);
    const start = now - 10;
    const end = now + 3600;
    const names = ["A", "B"].map((n) => ethers.encodeBytes32String(n));

    const Ballot = await ethers.getContractFactory("Ballot");
    const ballot = await Ballot.deploy(admin.address, await registry.getAddress(), names, start, end);
    await ballot.waitForDeployment();

    const commitment = ethers.keccak256(ethers.toUtf8Bytes("commitment:1111111111111:secret"));
    const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier:1111111111111:secret"));

    await registry.connect(admin).addEligibleVoters([commitment]);
    await ballot.connect(voter).vote(0, commitment, nullifier);

    const proposal = await ballot.getProposal(0);
    expect(proposal[1]).to.equal(1n);

    await expect(ballot.connect(voter).vote(0, commitment, nullifier)).to.be.revertedWith("Already voted");
    expect(await ballot.nullifierUsed(nullifier)).to.equal(true);
  });

  it("admin can start voting early with startVotingNow", async function () {
    const [admin] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("VoterRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const start = now + 3600;
    const end = now + 7200;
    const names = ["A", "B"].map((n) => ethers.encodeBytes32String(n));

    const Ballot = await ethers.getContractFactory("Ballot");
    const ballot = await Ballot.deploy(admin.address, await registry.getAddress(), names, start, end);
    await ballot.waitForDeployment();

    const commitment = ethers.keccak256(ethers.toUtf8Bytes("commitment:2222222222222:secret"));
    const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier:2222222222222:secret"));
    await registry.addEligibleVoters([commitment]);

    await expect(ballot.vote(0, commitment, nullifier)).to.be.revertedWith("Not started");

    await ballot.startVotingNow();
    await ballot.vote(0, commitment, nullifier);
    const proposal = await ballot.getProposal(0);
    expect(proposal[1]).to.equal(1n);
  });
});

describe("ElectionFactory", function () {
  it("creates ballot with creator as ballot admin", async function () {
    const [deployer, other] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("VoterRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Factory = await ethers.getContractFactory("ElectionFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const names = ["X", "Y"].map((n) => ethers.encodeBytes32String(n));

    const tx = await factory.createElection(await registry.getAddress(), names, now + 10, now + 1000);
    const receipt = await tx.wait();

    let ballotAddr;
    for (const log of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed && parsed.name === "ElectionCreated") {
          ballotAddr = parsed.args.ballot;
          break;
        }
      } catch {
        /* skip */
      }
    }

    const ballot = await ethers.getContractAt("Ballot", ballotAddr);
    expect(await ballot.admin()).to.equal(deployer.address);

    await expect(
      factory.connect(other).createElection(await registry.getAddress(), names, now + 20, now + 2000)
    ).to.be.revertedWith("Only admin");
  });
});

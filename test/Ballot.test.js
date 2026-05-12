const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Ballot", function () {
  it("allows eligible vote once and blocks second vote", async function () {
    const [admin] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("VoterRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const now = Math.floor(Date.now() / 1000);
    const start = now - 10;
    const end = now + 3600;
    const names = ["A", "B"].map((n) => ethers.encodeBytes32String(n));

    const Ballot = await ethers.getContractFactory("Ballot");
    const ballot = await Ballot.deploy(await registry.getAddress(), names, start, end);
    await ballot.waitForDeployment();

    const commitment = ethers.keccak256(ethers.toUtf8Bytes("commitment:1111111111111:secret"));
    const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier:1111111111111:secret"));

    await registry.addEligibleVoters([commitment]);
    await ballot.vote(0, commitment, nullifier);

    const proposal = await ballot.getProposal(0);
    expect(proposal[1]).to.equal(1n);

    await expect(ballot.vote(0, commitment, nullifier)).to.be.revertedWith("Already voted");
    expect(await ballot.nullifierUsed(nullifier)).to.equal(true);
    expect(admin.address).to.be.a("string");
  });
});

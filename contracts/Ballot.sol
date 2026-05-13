// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IVoterRegistry {
    function isEligible(bytes32 commitment) external view returns (bool);
}

contract Ballot {
    struct Proposal {
        bytes32 name;
        uint256 voteCount;
    }

    address public admin;
    IVoterRegistry public voterRegistry;
    uint64 public startTime;
    uint64 public endTime;
    Proposal[] public proposals;
    mapping(bytes32 => bool) public nullifierUsed;

    event VoteCast(bytes32 indexed nullifierHash, uint256 indexed proposalId);
    event VotingStarted(uint64 newStartTime);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(
        address _admin,
        address registryAddress,
        bytes32[] memory proposalNames,
        uint64 _startTime,
        uint64 _endTime
    ) {
        require(_admin != address(0), "Bad admin");
        require(registryAddress != address(0), "Bad registry");
        require(proposalNames.length > 1, "Need >=2 proposals");
        require(_endTime > _startTime, "Bad time range");

        admin = _admin;
        voterRegistry = IVoterRegistry(registryAddress);
        startTime = _startTime;
        endTime = _endTime;

        for (uint256 i = 0; i < proposalNames.length; i++) {
            proposals.push(Proposal({name: proposalNames[i], voteCount: 0}));
        }
    }

    /// @notice Admin can open voting immediately if the scheduled start is still in the future.
    function startVotingNow() external onlyAdmin {
        require(block.timestamp <= endTime, "Election ended");
        if (block.timestamp < startTime) {
            startTime = uint64(block.timestamp);
            emit VotingStarted(startTime);
        }
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    function vote(uint256 proposalId, bytes32 commitment, bytes32 nullifierHash) external {
        require(block.timestamp >= startTime, "Not started");
        require(block.timestamp <= endTime, "Ended");
        require(proposalId < proposals.length, "Bad proposal");
        require(voterRegistry.isEligible(commitment), "Not eligible");
        require(!nullifierUsed[nullifierHash], "Already voted");

        nullifierUsed[nullifierHash] = true;
        proposals[proposalId].voteCount += 1;

        emit VoteCast(nullifierHash, proposalId);
    }

    function getProposal(uint256 proposalId) external view returns (bytes32 name, uint256 voteCount) {
        require(proposalId < proposals.length, "Bad proposal");
        Proposal memory p = proposals[proposalId];
        return (p.name, p.voteCount);
    }

    function getWinner() external view returns (uint256 winnerId, uint256 winnerVotes) {
        uint256 maxVotes = 0;
        uint256 maxId = 0;

        for (uint256 i = 0; i < proposals.length; i++) {
            if (proposals[i].voteCount > maxVotes) {
                maxVotes = proposals[i].voteCount;
                maxId = i;
            }
        }

        return (maxId, maxVotes);
    }
}

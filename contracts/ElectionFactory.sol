// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ballot.sol";

/// @notice Deployed once. The factory admin creates new Ballot elections; each ballot's on-chain admin is the caller.
contract ElectionFactory {
    address public admin;

    event ElectionCreated(address indexed ballot, address indexed creator, address indexed registry, uint64 startTime, uint64 endTime);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Bad admin");
        admin = newAdmin;
    }

    /// @notice Creates a new election. msg.sender becomes the Ballot admin (can call startVotingNow).
    function createElection(
        address registry,
        bytes32[] calldata proposalNames,
        uint64 startTime,
        uint64 endTime
    ) external onlyAdmin returns (address ballot) {
        Ballot b = new Ballot(msg.sender, registry, proposalNames, startTime, endTime);
        ballot = address(b);
        emit ElectionCreated(ballot, msg.sender, registry, startTime, endTime);
    }
}

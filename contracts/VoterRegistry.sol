// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VoterRegistry {
    address public admin;
    mapping(bytes32 => bool) public eligibleCommitments;

    event VotersAdded(uint256 count);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function addEligibleVoters(bytes32[] calldata commitments) external onlyAdmin {
        require(commitments.length > 0, "Empty list");

        for (uint256 i = 0; i < commitments.length; i++) {
            eligibleCommitments[commitments[i]] = true;
        }

        emit VotersAdded(commitments.length);
    }

    function isEligible(bytes32 commitment) external view returns (bool) {
        return eligibleCommitments[commitment];
    }
}

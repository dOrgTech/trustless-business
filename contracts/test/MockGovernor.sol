// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../IGovernor.sol";

// A mock Governor for testing the appeal mechanism.
contract MockGovernor is IGovernor {
    ProposalState public proposalState;

    // Test-only function to set the state of a proposal
    function setProposalState(ProposalState _newState) external {
        proposalState = _newState;
    }

    function state(uint256 proposalId) external view override returns (ProposalState) {
        proposalId; // silence warning
        return proposalState;
    }
}
// MockGovernor.sol
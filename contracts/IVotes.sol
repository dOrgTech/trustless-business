// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IVotes Interface
 * @dev Defines the function required to check an account's current voting power.
 * This is typically implemented by governance tokens following the ERC20Votes standard.
 */
interface IVotes {
    /**
     * @dev Gets the current voting power of an address.
     * @param account The address to check.
     * @return The voting power of the account.
     */
    function getVotes(address account) external view returns (uint256);
}
// IVotes.sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

// A mock RepToken for testing the Economy's projectThreshold feature.
contract MockRepToken {
    mapping(address => uint256) public balances;

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    // Test-only function to mint tokens to an address
    function mint(address to, uint256 amount) external {
        balances[to] += amount;
    }
}
// MockRepToken.sol
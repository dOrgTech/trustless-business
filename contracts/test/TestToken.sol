// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// A basic ERC20 token for testing purposes.
contract TestToken is ERC20 {
    constructor() ERC20("Testy test", "TST") {
        _mint(msg.sender, 1000000 * 10**18); // Mint 1 million tokens to the deployer
    }
}
// TestToken.sol
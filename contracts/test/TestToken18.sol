// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken18 is ERC20 {
    constructor() ERC20("Test Token 18", "TT18") {
        _mint(msg.sender, 1000000 * 10**18);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}

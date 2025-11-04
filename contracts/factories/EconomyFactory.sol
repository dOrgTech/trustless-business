// contracts/factories/EconomyFactory.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../Economy.sol";

contract EconomyFactory {
    address[] public deployedEconomies;

    function deployEconomy() external returns (address) {
        Economy economy = new Economy();
        deployedEconomies.push(address(economy));
        return address(economy);
    }
}
// EconomyFactory.sol
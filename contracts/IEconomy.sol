// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IEconomy {
    function updateEarnings(address user, uint amount, bool native) external;
    function updateSpendings(address user, uint amount, bool native) external;
    function registerProjectRoles(address projectAddress, address author, address contractor, address arbiter) external;
}
// IEconomy.sol
// contracts/factories/InfrastructureFactory.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../Registry.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";

contract InfrastructureFactory {
    address[] public deployedTimelocks;
    address[] public deployedRegistries;

    function deployTimelock(address admin, uint256 executionDelay) external returns (address) {
        address[] memory proposers;
        address[] memory executors;
        TimelockController timelock = new TimelockController(uint32(executionDelay), proposers, executors, admin);
        deployedTimelocks.push(address(timelock));
        return address(timelock);
    }

    function deployRegistry(address initialOwner, address wrapperAddress) external returns (address) {
        Registry registry = new Registry(initialOwner, wrapperAddress);
        deployedRegistries.push(address(registry));
        return address(registry);
    }
}
// contracts/factories/InfrastructureFactory.sol
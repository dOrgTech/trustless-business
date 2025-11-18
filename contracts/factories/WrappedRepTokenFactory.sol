// contracts/factories/WrappedRepTokenFactory.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../WrappedRepToken.sol";

/**
 * @title WrappedRepTokenFactory
 * @notice Factory for deploying WrappedRepToken instances
 * @dev Deploys governance tokens that wrap underlying ERC20 tokens
 */
contract WrappedRepTokenFactory {
    address[] public deployedWrappedRepTokens;
    event Deployed(address wrappedRepToken, address underlyingToken);

    /**
     * @notice Deploys a new WrappedRepToken
     * @param underlyingToken The ERC20 token to wrap
     * @param name Token name (typically matches DAO name)
     * @param symbol Token symbol
     * @param transferrable Whether the wrapped token can be transferred
     * @return The address of the deployed WrappedRepToken
     */
    function deployWrappedRepToken(
        IERC20 underlyingToken,
        string memory name,
        string memory symbol,
        bool transferrable
    ) external returns (address) {
        require(address(underlyingToken) != address(0), "WrappedRepTokenFactory: Underlying token cannot be zero address");

        WrappedRepToken wrappedRepToken = new WrappedRepToken(
            underlyingToken,
            name,
            symbol,
            transferrable
        );

        // Transfer admin to the calling factory
        wrappedRepToken.setAdmin(msg.sender);

        address wrappedRepTokenAddr = address(wrappedRepToken);
        deployedWrappedRepTokens.push(wrappedRepTokenAddr);
        emit Deployed(wrappedRepTokenAddr, address(underlyingToken));
        return wrappedRepTokenAddr;
    }

    /**
     * @notice Returns the number of deployed wrapped tokens
     */
    function getDeployedCount() external view returns (uint256) {
        return deployedWrappedRepTokens.length;
    }
}

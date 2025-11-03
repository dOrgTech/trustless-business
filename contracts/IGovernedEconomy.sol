// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

// This interface defines the getters for DAO-governed parameters
// that Project contracts need to read from the main Economy contract.
interface IGovernedEconomy {
    function coolingOffPeriod() external view returns (uint);
    function nativeArbitrationFee() external view returns (uint);
    function platformFeeBps() external view returns (uint);
    function authorFeeBps() external view returns (uint);
    function backersVoteQuorumBps() external view returns (uint);
    function appealPeriod() external view returns (uint); // NEW
    function repTokenAddress() external view returns (address); // NEW
    function projectThreshold() external view returns (uint); // NEW
}
// IGovernedEconomy.sol
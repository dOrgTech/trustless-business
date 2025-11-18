const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0xD30041126290B59F434F583DB2053a4e1ce37dd6";
  const proposalId = "106481940541326129766207999726470656243130435431205753615778804570199096096926";
  
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);
  
  console.log("=== Checking DAO with Non-Zero Execution Delay ===\n");
  
  // Get timelock info
  const timelockAddr = await dao.timelock();
  console.log("Timelock address:", timelockAddr);
  
  const timelock = await ethers.getContractAt(
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController",
    timelockAddr
  );
  
  const minDelay = await timelock.getMinDelay();
  console.log("Minimum delay:", minDelay.toString(), "seconds");
  
  // Get proposal state
  const state = await dao.state(proposalId);
  const stateNames = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"];
  console.log("Proposal state:", stateNames[state]);
  
  console.log("\n=== Checking if Operation Exists in Timelock ===");
  
  // We need to construct the operation ID to check
  // First, get proposal details from Firestore or reconstruct
  console.log("\nTo check timelock, we need the proposal details.");
  console.log("Let me query them from Firestore...");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

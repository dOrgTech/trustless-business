const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0x11B14fD23557cE18c8faa89F7D2c21B1f951af2e";
  const proposalId = "25129221281538011219754517157172944762813024215562046079309328385989039257248";
  const tokenAddress = "0xEd12461863c7e168551eB48cda7c18D6682a74e2";
  
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);
  const token = await ethers.getContractAt("RepToken", tokenAddress);
  
  console.log("Checking proposal state...");
  const state = await dao.state(proposalId);
  const stateNames = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"];
  console.log("  Proposal State:", stateNames[state], `(${state})`);
  
  console.log("\nChecking token admin...");
  const admin = await token.admin();
  console.log("  Token admin:", admin);
  
  console.log("\nChecking DAO timelock...");
  const timelock = await dao.timelock();
  console.log("  DAO timelock:", timelock);
  
  if (admin.toLowerCase() !== timelock.toLowerCase()) {
    console.log("\n❌ PROBLEM FOUND:");
    console.log("  Token admin is NOT the timelock!");
    console.log("  Token admin:", admin);
    console.log("  Should be:", timelock);
    console.log("  This will cause mint/burn proposals to fail.");
  } else {
    console.log("\n✓ Token admin is correctly set to timelock");
  }
  
  // Check if proposal can be executed
  console.log("\nChecking if proposal can be executed...");
  try {
    const canExecute = state === 5; // Queued = 5
    console.log("  Can execute:", canExecute);
    
    if (canExecute) {
      console.log("\nProposal details:");
      // Get proposal details
      const filter = dao.filters.ProposalCreated(proposalId);
      const events = await dao.queryFilter(filter, 0, 'latest');
      if (events.length > 0) {
        const event = events[0];
        console.log("  Targets:", event.args.targets);
        console.log("  Values:", event.args.values.map(v => v.toString()));
        console.log("  Calldatas:", event.args.calldatas);
      }
    }
  } catch (error) {
    console.log("  Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

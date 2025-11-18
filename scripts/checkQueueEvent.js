const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0x11B14fD23557cE18c8faa89F7D2c21B1f951af2e";
  const proposalId = "25129221281538011219754517157172944762813024215562046079309328385989039257248";
  
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);
  
  console.log("Searching for ProposalQueued event...");
  const filter = dao.filters.ProposalQueued();
  const currentBlock = await ethers.provider.getBlockNumber();
  
  // Search last 50k blocks
  try {
    const events = await dao.queryFilter(filter, currentBlock - 50000, currentBlock);
    console.log(`Found ${events.length} ProposalQueued events`);
    
    for (const event of events) {
      if (event.args.proposalId.toString() === proposalId) {
        console.log("\n✓ Found our proposal:");
        console.log("  Proposal ID:", event.args.proposalId.toString());
        console.log("  ETA (timestamp):", event.args.etaSeconds ? event.args.etaSeconds.toString() : event.args.eta?.toString());
        console.log("  Block:", event.blockNumber);
        console.log("  Tx:", event.transactionHash);
        
        // Get the full transaction to see what was actually queued
        const tx = await event.getTransaction();
        console.log("\n  Transaction data (first 200 chars):", tx.data.substring(0, 200));
        
        // Try to decode it
        try {
          const decoded = dao.interface.parseTransaction({ data: tx.data });
          console.log("\n  Function called:", decoded.name);
          console.log("  Args:", decoded.args);
        } catch (e) {
          console.log("  Could not decode transaction");
        }
      }
    }
  } catch (error) {
    console.log("Error:", error.message);
    console.log("Trying smaller block range...");
    
    const events = await dao.queryFilter(filter, currentBlock - 5000, currentBlock);
    console.log(`Found ${events.length} ProposalQueued events in last 5000 blocks`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

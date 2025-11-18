const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0x11B14fD23557cE18c8faa89F7D2c21B1f951af2e";
  const proposalId = "25129221281538011219754517157172944762813024215562046079309328385989039257248";
  
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);
  
  console.log("Searching for proposal creation event...");
  console.log("Proposal ID:", proposalId);
  console.log();
  
  // Firestore says created at 2025-11-18 11:53:17 UTC
  // That's timestamp ~1731931997
  // Find the block around that time
  
  const currentBlock = await ethers.provider.getBlockNumber();
  console.log("Current block:", currentBlock);
  
  // Binary search to find block around creation time
  const targetTime = 1731931997; // 2025-11-18 11:53:17 UTC
  
  let low = currentBlock - 100000;
  let high = currentBlock;
  let targetBlock = currentBlock - 50000;
  
  // Simple approximation: blocks are ~2 seconds apart on Etherlink
  const currentBlockData = await ethers.provider.getBlock(currentBlock);
  const currentTime = currentBlockData.timestamp;
  const timeDiff = currentTime - targetTime;
  const blockDiff = Math.floor(timeDiff / 2); // ~2 sec per block
  targetBlock = currentBlock - blockDiff;
  
  console.log("Estimated creation block:", targetBlock);
  console.log("Searching around that block...\n");
  
  // Search in a range around the target
  const searchFrom = targetBlock - 500;
  const searchTo = targetBlock + 500;
  
  try {
    const filter = dao.filters.ProposalCreated();
    const events = await dao.queryFilter(filter, searchFrom, searchTo);
    
    console.log(`Found ${events.length} ProposalCreated events in range`);
    
    for (const event of events) {
      if (event.args.proposalId.toString() === proposalId) {
        console.log("\n✓ Found ProposalCreated event!");
        console.log("Block:", event.blockNumber);
        console.log("Tx hash:", event.transactionHash);
        console.log("Description:", event.args.description);
        
        const block = await ethers.provider.getBlock(event.blockNumber);
        console.log("Block timestamp:", new Date(block.timestamp * 1000).toISOString());
        
        // Now search for queue event after creation
        console.log("\nSearching for ProposalQueued event after creation...");
        const queueFilter = dao.filters.ProposalQueued();
        const queueEvents = await dao.queryFilter(queueFilter, event.blockNumber, event.blockNumber + 1000);
        
        for (const qEvent of queueEvents) {
          if (qEvent.args.proposalId.toString() === proposalId) {
            console.log("\n✓ Found ProposalQueued event!");
            console.log("Block:", qEvent.blockNumber);
            console.log("Tx hash:", qEvent.transactionHash);
            
            // Check the transaction
            const receipt = await ethers.provider.getTransactionReceipt(qEvent.transactionHash);
            console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
            
            if (receipt.status === 1) {
              console.log("\nQueue transaction succeeded. Checking timelock events...");
              
              const timelock = await dao.timelock();
              console.log("Timelock:", timelock);
              
              // Look for CallScheduled events
              const callScheduledTopic = ethers.id("CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)");
              const timelockLogs = receipt.logs.filter(log =>
                log.address.toLowerCase() === timelock.toLowerCase()
              );
              
              console.log("Logs from timelock in queue tx:", timelockLogs.length);
              
              timelockLogs.forEach((log, i) => {
                console.log(`\nTimelock log ${i}:`);
                console.log("  Topics:", log.topics);
                console.log("  Data:", log.data.substring(0, 66));
              });
            }
            
            return;
          }
        }
        
        console.log("\n❌ ProposalQueued event not found after creation!");
        console.log("The proposal may never have been queued on-chain.");
        
        return;
      }
    }
    
    console.log("\n❌ ProposalCreated event not found in estimated range");
    console.log("The proposal ID may be incorrect or the block range needs adjustment");
    
  } catch (error) {
    console.log("Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

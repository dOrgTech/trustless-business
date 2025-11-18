const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0x11B14fD23557cE18c8faa89F7D2c21B1f951af2e";
  const proposalId = "25129221281538011219754517157172944762813024215562046079309328385989039257248";
  
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);
  
  console.log("=== Investigating 0-Delay Timelock Issue ===\n");
  
  // Get timelock
  const timelockAddr = await dao.timelock();
  console.log("Timelock address:", timelockAddr);
  
  const timelock = await ethers.getContractAt(
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController",
    timelockAddr
  );
  
  const minDelay = await timelock.getMinDelay();
  console.log("Timelock minimum delay:", minDelay.toString(), "seconds");
  
  // Check proposal state
  const state = await dao.state(proposalId);
  const stateNames = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"];
  console.log("Proposal state:", stateNames[state]);
  
  console.log("\n=== Checking ProposalQueued Event ===");
  
  // Find the ProposalQueued event - search smaller ranges
  const currentBlock = await ethers.provider.getBlockNumber();
  console.log("Current block:", currentBlock);
  
  // Try to find the event in chunks
  let queueEvent = null;
  const chunkSize = 1000;
  
  for (let i = 0; i < 10; i++) {
    const toBlock = currentBlock - (i * chunkSize);
    const fromBlock = toBlock - chunkSize;
    
    try {
      const filter = dao.filters.ProposalQueued();
      const events = await dao.queryFilter(filter, fromBlock, toBlock);
      
      for (const event of events) {
        if (event.args.proposalId.toString() === proposalId) {
          queueEvent = event;
          console.log("Found ProposalQueued event at block:", event.blockNumber);
          console.log("Transaction hash:", event.transactionHash);
          break;
        }
      }
      
      if (queueEvent) break;
    } catch (e) {
      // Skip if block range error
    }
  }
  
  if (!queueEvent) {
    console.log("WARNING: Could not find ProposalQueued event");
    console.log("The proposal may not have been queued on-chain despite Firestore showing 'Queued'");
    return;
  }
  
  console.log("\n=== Analyzing Queue Transaction ===");
  
  const queueTx = await ethers.provider.getTransaction(queueEvent.transactionHash);
  const queueReceipt = await ethers.provider.getTransactionReceipt(queueEvent.transactionHash);
  
  console.log("Queue transaction status:", queueReceipt.status === 1 ? "SUCCESS" : "FAILED");
  console.log("Gas used:", queueReceipt.gasUsed.toString());
  
  if (queueReceipt.status !== 1) {
    console.log("\n❌ PROBLEM: Queue transaction FAILED!");
    console.log("This explains why the operation is not in the timelock.");
    return;
  }
  
  console.log("\n=== Checking Timelock Events from Queue Transaction ===");
  
  // Check if TimelockController emitted CallScheduled event
  const callScheduledTopic = ethers.id("CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)");
  
  const timelockLogs = queueReceipt.logs.filter(log => 
    log.address.toLowerCase() === timelockAddr.toLowerCase() &&
    log.topics[0] === callScheduledTopic
  );
  
  console.log("CallScheduled events from timelock:", timelockLogs.length);
  
  if (timelockLogs.length === 0) {
    console.log("\n❌ CRITICAL: No CallScheduled event found!");
    console.log("The timelock did not schedule the operation despite queue() succeeding.");
    console.log("\nPossible causes:");
    console.log("1. The operation was already scheduled");
    console.log("2. There's a bug in the queue flow");
    console.log("3. The minimum delay is 0 and TimelockController doesn't schedule 0-delay operations");
  } else {
    console.log("✓ Operation was scheduled in timelock");
    
    // Get the operation ID from the event
    const operationId = timelockLogs[0].topics[1];
    console.log("Operation ID from event:", operationId);
    
    // Check current status
    const isReady = await timelock.isOperationReady(operationId);
    const isPending = await timelock.isOperationPending(operationId);
    const isDone = await timelock.isOperationDone(operationId);
    
    console.log("\nOperation status:");
    console.log("  Is ready:", isReady);
    console.log("  Is pending:", isPending);
    console.log("  Is done:", isDone);
    
    if (isDone) {
      console.log("\n❌ Operation already executed or cancelled!");
    } else if (isReady) {
      console.log("\n✓ Operation is ready to execute");
    } else if (isPending) {
      const timestamp = await timelock.getTimestamp(operationId);
      const currentTime = Math.floor(Date.now() / 1000);
      console.log("\n⏰ Operation pending:");
      console.log("  Ready at:", new Date(Number(timestamp) * 1000).toISOString());
      console.log("  Wait time:", Number(timestamp) - currentTime, "seconds");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

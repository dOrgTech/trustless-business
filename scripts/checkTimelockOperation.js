const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0xD30041126290B59F434F583DB2053a4e1ce37dd6";
  const proposalId = "106481940541326129766207999726470656243130435431205753615778804570199096096926";
  const tokenAddress = "0x34E1497a3FD0dd69EE49F35C82fACaCF3F4131F0";
  
  // From Firestore
  const targets = [tokenAddress];
  const values = [0];
  const calldatas = ["0x40c10f1900000000000000000000000006e5b15bc39f921e1503073dbb8a5da2fc6220e90000000000000000000000000000000000000000000000ae9c5ac2691d340000"];
  const description = "asdasdasd";
  
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);
  const timelockAddr = await dao.timelock();
  
  console.log("DAO:", daoAddress);
  console.log("Timelock:", timelockAddr);
  
  const timelock = await ethers.getContractAt(
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController",
    timelockAddr
  );
  
  const minDelay = await timelock.getMinDelay();
  console.log("Min delay:", minDelay.toString(), "seconds\n");
  
  // Calculate operation ID
  const descriptionHash = ethers.id(description);
  console.log("Description:", description);
  console.log("Description hash:", descriptionHash);
  
  const operationId = await timelock.hashOperationBatch(
    targets,
    values,
    calldatas,
    ethers.ZeroHash,
    descriptionHash
  );
  
  console.log("\nOperation ID:", operationId);
  
  const isReady = await timelock.isOperationReady(operationId);
  const isPending = await timelock.isOperationPending(operationId);
  const isDone = await timelock.isOperationDone(operationId);
  
  console.log("\nTimelock Status:");
  console.log("  Is ready:", isReady);
  console.log("  Is pending:", isPending);
  console.log("  Is done:", isDone);
  
  if (isPending) {
    const timestamp = await timelock.getTimestamp(operationId);
    const currentBlock = await ethers.provider.getBlock('latest');
    const currentTime = currentBlock.timestamp;
    const remainingTime = Number(timestamp) - currentTime;
    
    console.log("\n  Scheduled for:", new Date(Number(timestamp) * 1000).toISOString());
    console.log("  Current time:", new Date(currentTime * 1000).toISOString());
    
    if (remainingTime > 0) {
      console.log("  ⏰ Not ready yet. Wait:", remainingTime, "seconds");
    } else {
      console.log("  ✓ Ready to execute!");
    }
  } else if (!isPending && !isDone) {
    console.log("\n❌ Operation NOT found in timelock!");
    console.log("This means queue() didn't properly schedule it.");
  }
  
  // Try to execute
  console.log("\n=== Testing Execution ===");
  try {
    await dao.execute.staticCall(targets, values, calldatas, descriptionHash);
    console.log("✓ Execution would succeed!");
  } catch (error) {
    console.log("❌ Execution failed:", error.shortMessage || error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

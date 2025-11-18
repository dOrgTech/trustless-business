const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  
  const daoAddress = "0x11B14fD23557cE18c8faa89F7D2c21B1f951af2e";
  const proposalId = "25129221281538011219754517157172944762813024215562046079309328385989039257248";
  const tokenAddress = "0xEd12461863c7e168551eB48cda7c18D6682a74e2";
  const mintTo = "0x6E147e1D239bF49c88d64505e746e8522845D8D3";
  const mintAmount = "29000000000000000000"; // 29 tokens
  
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);
  
  // Manually construct the proposal params
  const targets = [tokenAddress];
  const values = [0];
  
  // Encode mint(address,uint256) calldata
  const iface = new ethers.Interface(["function mint(address to, uint256 amount)"]);
  const calldata = iface.encodeFunctionData("mint", [mintTo, mintAmount]);
  const calldatas = [calldata];
  
  const description = "tokens"; // From Firestore
  const descriptionHash = ethers.id(description);
  
  console.log("Proposal Parameters:");
  console.log("  Targets:", targets);
  console.log("  Values:", values);
  console.log("  Calldatas:", calldatas);
  console.log("  Description:", description);
  console.log("  Description Hash:", descriptionHash);
  
  console.log("\nAttempting static call to execute...");
  try {
    await dao.execute.staticCall(
      targets,
      values,
      calldatas,
      descriptionHash
    );
    console.log("✓ Execution simulation succeeded!");
  } catch (error) {
    console.log("❌ Execution simulation failed:");
    console.log("  Error:", error.shortMessage || error.message);
    
    // Check timelock delay
    console.log("\nChecking timelock...");
    const timelockAddr = await dao.timelock();
    console.log("  Timelock address:", timelockAddr);
    
    const timelockContract = await ethers.getContractAt(
      "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController",
      timelockAddr
    );
    
    const minDelay = await timelockContract.getMinDelay();
    console.log("  Minimum delay:", minDelay.toString(), "seconds");
    
    // Check if operation is ready
    const operationId = await timelockContract.hashOperationBatch(
      targets,
      values,
      calldatas,
      ethers.ZeroHash,
      descriptionHash
    );
    console.log("\n  Operation ID:", operationId);
    
    const isReady = await timelockContract.isOperationReady(operationId);
    const isPending = await timelockContract.isOperationPending(operationId);
    const isDone = await timelockContract.isOperationDone(operationId);
    
    console.log("  Is ready:", isReady);
    console.log("  Is pending:", isPending);
    console.log("  Is done:", isDone);
    
    if (isPending && !isReady) {
      const timestamp = await timelockContract.getTimestamp(operationId);
      const currentBlock = await ethers.provider.getBlock('latest');
      const currentTime = currentBlock.timestamp;
      const remainingTime = Number(timestamp) - currentTime;
      
      console.log("\n  ⏰ Proposal queued but not ready yet:");
      console.log("    Scheduled for:", new Date(Number(timestamp) * 1000).toISOString());
      console.log("    Current time:", new Date(currentTime * 1000).toISOString());
      console.log("    Remaining time:", remainingTime, "seconds (", Math.floor(remainingTime / 60), "minutes)");
    } else if (!isPending) {
      console.log("\n  ❌ Operation not found in timelock!");
      console.log("     The proposal may not have been queued correctly.");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

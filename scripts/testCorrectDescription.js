const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0xD30041126290B59F434F583DB2053a4e1ce37dd6";
  const tokenAddress = "0x34E1497a3FD0dd69EE49F35C82fACaCF3F4131F0";
  
  const targets = [tokenAddress];
  const values = [0];
  const calldatas = ["0x40c10f1900000000000000000000000006e5b15bc39f921e1503073dbb8a5da2fc6220e90000000000000000000000000000000000000000000000ae9c5ac2691d340000"];
  
  // Based on Firestore data:
  // title: "Mint please"
  // type: "mint"
  // description: "asdasdasd"
  // externalResource: "asdasd"
  
  const fullDescription = "Mint please0|||0mint0|||0asdasdasd0|||0asdasd";
  const descriptionHash = ethers.id(fullDescription);
  
  console.log("Testing with full description format:");
  console.log("Description:", fullDescription);
  console.log("Hash:", descriptionHash);
  
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);
  const timelockAddr = await dao.timelock();
  const timelock = await ethers.getContractAt(
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController",
    timelockAddr
  );
  
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
  
  console.log("Is ready:", isReady);
  console.log("Is pending:", isPending);
  console.log("Is done:", isDone);
  
  if (isPending || isReady) {
    console.log("\n✓ Operation found in timelock!");
    
    console.log("\nTrying to execute...");
    try {
      await dao.execute.staticCall(targets, values, calldatas, descriptionHash);
      console.log("✓✓✓ EXECUTION WOULD SUCCEED!");
    } catch (error) {
      console.log("Still fails:", error.shortMessage);
    }
  } else {
    console.log("\n❌ Still not found in timelock");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

const { ethers } = require("hardhat");

/**
 * Test that StandardFactoryNonTransferable correctly creates non-transferable tokens
 */

async function main() {
  console.log("Testing StandardFactoryNonTransferable...\n");

  const [deployer, user1] = await ethers.getSigners();
  console.log(`Testing with account: ${deployer.address}\n`);

  // Get deployed factory
  const factoryAddr = "0xc558cD4e3Fa91C51141ab0E6Cd77b5Fe94B0B002";
  const StandardFactory = await ethers.getContractFactory("StandardFactoryNonTransferable");
  const factory = StandardFactory.attach(factoryAddr);

  console.log(`StandardFactoryNonTransferable at: ${factoryAddr}`);
  console.log("This factory ALWAYS creates NON-TRANSFERABLE tokens\n");

  // Test parameters
  const name = "Test Non-Transferable DAO";
  const symbol = "NTDAO";
  const description = "Testing non-transferability";
  const decimals = 18;
  const executionDelay = 60;
  const initialMembers = [deployer.address];
  const initialAmounts = [
    ethers.parseEther("100"), // 100 tokens to deployer
    1,   // votingDelay
    50,  // votingPeriod
    0,   // proposalThreshold
    4    // quorumFraction
  ];
  const keys = [];
  const values = [];

  console.log("═══════════════════════════════════════════════════════");
  console.log("DEPLOYING DAO (should create NON-TRANSFERABLE tokens)");
  console.log("═══════════════════════════════════════════════════════\n");

  try {
    const tx = await factory.deployDAOwithToken(
      name,
      symbol,
      description,
      decimals,
      executionDelay,
      initialMembers,
      initialAmounts,
      keys,
      values
    );

    console.log(`Transaction sent: ${tx.hash}`);
    console.log("Waiting for confirmation...\n");

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Get the DAO address from event
    const event = receipt.logs.find(log => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed && parsed.name === "NewDaoCreated";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = factory.interface.parseLog(event);
      const tokenAddr = parsed.args.token;
      const daoAddr = parsed.args.dao;

      console.log(`\n📋 Deployed addresses:`);
      console.log(`   DAO:   ${daoAddr}`);
      console.log(`   Token: ${tokenAddr}\n`);

      // Try to transfer tokens (should fail)
      const RepToken = await ethers.getContractFactory("RepToken");
      const token = RepToken.attach(tokenAddr);

      const balance = await token.balanceOf(deployer.address);
      console.log(`Current balance: ${ethers.formatEther(balance)} ${symbol}`);

      // Check if token reports as non-transferable
      const isTransferable = await token.isTransferable();
      console.log(`Token isTransferable: ${isTransferable}\n`);

      if (isTransferable) {
        console.log("❌❌❌ CRITICAL FAIL: Token reports as TRANSFERABLE!");
        console.log("The bug still exists!\n");
        return;
      }

      console.log("Testing transfer (should fail)...");
      try {
        const transferTx = await token.transfer(user1.address, ethers.parseEther("10"));
        await transferTx.wait();
        console.log("❌❌❌ CRITICAL FAIL: Transfer succeeded!");
        console.log("Tokens are TRANSFERABLE when they should be non-transferable\n");
      } catch (error) {
        if (error.message.includes("non-transferable") || error.message.includes("Reputation is non-transferable")) {
          console.log("✅✅✅ SUCCESS: Transfer correctly rejected!");
          console.log(`   Error: "${error.message.match(/Reputation is non-transferable/)[0]}"`);
          console.log("\n🎉🎉🎉 THE FIX WORKS!");
          console.log("Tokens from this factory are GUARANTEED to be non-transferable\n");
        } else {
          console.log("⚠️  Transfer failed with unexpected error:");
          console.log("   " + error.message.split("\n")[0] + "\n");
        }
      }
    }

  } catch (error) {
    console.error("❌ Deployment failed:", error.message);
  }

  console.log("\n═══════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

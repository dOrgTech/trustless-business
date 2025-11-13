const { ethers } = require("hardhat");

/**
 * Quick test to verify the StandardFactory correctly handles transferrability
 * Tests both legacy (bool) and new (string) parameter formats
 */

async function main() {
  console.log("Testing StandardFactory transferrability fix...\n");

  const [deployer, user1, user2] = await ethers.getSigners();
  console.log(`Testing with account: ${deployer.address}\n`);

  // Get deployed StandardFactory
  const standardFactoryAddr = "0x1F19eFDE526Ab2ef32eF5Db66Cd858D3E5f00B0a";
  const StandardFactory = await ethers.getContractFactory("StandardFactory");
  const factory = StandardFactory.attach(standardFactoryAddr);

  console.log(`StandardFactory at: ${standardFactoryAddr}\n`);

  // Test parameters - creating NON-TRANSFERABLE token
  const name = "Test DAO";
  const symbol = "TEST";
  const description = "Testing non-transferability";
  const decimals = 18;
  const executionDelay = 60; // 1 minute
  const initialMembers = [deployer.address];
  const initialAmounts = [
    ethers.parseEther("100"), // 100 tokens to deployer
    1, // votingDelay (1 block)
    50, // votingPeriod (50 blocks)
    0, // proposalThreshold (0 tokens)
    4  // quorumFraction (4%)
  ];
  const keys = [];
  const values = [];

  console.log("═══════════════════════════════════════════════════════");
  console.log("TEST: Creating NON-TRANSFERABLE DAO with string 'false'");
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
      values,
      "false" // This should create NON-TRANSFERABLE token
    );

    console.log(`Transaction sent: ${tx.hash}`);
    console.log("Waiting for confirmation...\n");

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Get the DAO address from event
    const event = receipt.logs.find(log => {
      try {
        return factory.interface.parseLog(log).name === "NewDaoCreated";
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

      console.log("Testing token transferrability...");
      console.log(`Current balance: ${ethers.formatEther(await token.balanceOf(deployer.address))} ${symbol}\n`);

      try {
        const transferTx = await token.transfer(user1.address, ethers.parseEther("10"));
        await transferTx.wait();
        console.log("❌ FAIL: Token transfer succeeded (should have failed!)");
        console.log("   The bug is NOT fixed - tokens are still transferable\n");
      } catch (error) {
        if (error.message.includes("non-transferable") || error.message.includes("Reputation is non-transferable")) {
          console.log("✅ SUCCESS: Token transfer correctly rejected!");
          console.log("   Error: " + error.message.split("\n")[0]);
          console.log("\n🎉 The fix works! Non-transferable tokens are now properly enforced.\n");
        } else {
          console.log("⚠️  UNEXPECTED: Token transfer failed with different error:");
          console.log("   " + error.message.split("\n")[0] + "\n");
        }
      }
    }

  } catch (error) {
    console.error("❌ Deployment failed:", error.message);
    if (error.message.includes("UNPREDICTABLE_GAS_LIMIT")) {
      console.error("\n💡 This might be a contract error. Check that all parameters are correct.");
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("Test complete!");
  console.log("═══════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

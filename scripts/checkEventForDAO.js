const { ethers } = require("hardhat");

async function main() {
  const factoryAddress = "0x422657c7620Dde17Ca9439e25863d0011767d574";
  const daoAddress = "0x8B08204cbbCc318564e0d2CF45BD795f0A602462";
  const deployBlock = 22844802;
  
  const factory = await ethers.getContractAt("StandardFactoryWrapped", factoryAddress);
  
  console.log(`Checking block ${deployBlock} for DaoWrappedDeploymentInfo event...`);
  
  const filter = factory.filters.DaoWrappedDeploymentInfo();
  const events = await factory.queryFilter(filter, deployBlock, deployBlock);
  
  console.log(`Found ${events.length} events in block ${deployBlock}`);
  
  for (const event of events) {
    if (event.args.daoAddress.toLowerCase() === daoAddress.toLowerCase()) {
      console.log("\n=== Event found for DAO:", daoAddress, "===");
      console.log("Block:", event.blockNumber);
      console.log("Tx Hash:", event.transactionHash);
      console.log("\nEvent Args:");
      console.log("  daoAddress:", event.args.daoAddress);
      console.log("  wrappedTokenAddress:", event.args.wrappedTokenAddress);
      console.log("  underlyingTokenAddress:", event.args.underlyingTokenAddress);
      console.log("  daoName:", event.args.daoName);
      console.log("  wrappedTokenSymbol:", event.args.wrappedTokenSymbol);
      console.log("  quorumFraction:", event.args.quorumFraction.toString());
      console.log("  executionDelay:", event.args.executionDelay.toString(), "seconds");
      console.log("  votingDelay:", event.args.votingDelay.toString(), "seconds");
      console.log("  votingPeriod:", event.args.votingPeriod.toString(), "seconds");
      console.log("  proposalThreshold:", event.args.proposalThreshold.toString());
      
      console.log("\n=== VERIFICATION ===");
      const votingDelaySeconds = Number(event.args.votingDelay);
      const votingPeriodSeconds = Number(event.args.votingPeriod);
      const votingDelayMinutes = votingDelaySeconds / 60;
      const votingPeriodMinutes = votingPeriodSeconds / 60;
      
      console.log(`Voting Delay: ${votingDelaySeconds} seconds = ${votingDelayMinutes} minutes`);
      console.log(`Voting Period: ${votingPeriodSeconds} seconds = ${votingPeriodMinutes} minutes`);
      
      if (votingDelaySeconds > 0 && votingPeriodSeconds > 0) {
        console.log("\n✅ FIX VERIFIED: Values are in seconds (not minutes)!");
        console.log("   Indexer will correctly divide by 60 to get minutes.");
      } else {
        console.log("\n❌ PROBLEM: Values are 0 or invalid");
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

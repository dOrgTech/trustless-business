const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying a test DAO through StandardFactory on Etherlink Testnet...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // StandardFactory address from previous deployment
  const STANDARD_FACTORY_ADDRESS = "0xD5c69deaA484acAE65bA1Fb4602bDF641c804745";

  console.log("StandardFactory address:", STANDARD_FACTORY_ADDRESS);

  // Get StandardFactory contract
  const StandardFactory = await ethers.getContractFactory("StandardFactory");
  const standardFactory = StandardFactory.attach(STANDARD_FACTORY_ADDRESS);

  // Test DAO parameters (with proper checksums)
  const initialMembers = [
    ethers.getAddress("0x06e5b15bc39f921e1503073dbb8a5da2fc6220e9"), // ACCOUNT1 (deployer)
    ethers.getAddress("0x6e147e1d239bf49c88d64505e746e8522845d8d3"), // ALICE
    ethers.getAddress("0x6a9cbf5d01b9760ca99c3c27db0b23e3b8bd454b"), // BOB
    ethers.getAddress("0x530ef26c437d424e08839903189b1fafb2b14a27"), // TIM
  ];

  const initialAmounts = [
    ethers.parseEther("1000"),  // ACCOUNT1: 1000 tokens
    ethers.parseEther("500"),   // ALICE: 500 tokens
    ethers.parseEther("300"),   // BOB: 300 tokens
    ethers.parseEther("200"),   // TIM: 200 tokens
  ];

  const daoParams = {
    name: "Test DAO via StandardFactory",
    symbol: "TDAO",
    description: "A test DAO deployed through the new StandardFactory to verify indexer integration",
    executionDelay: 60,  // 1 minute for testing
    initialMembers: initialMembers,
    initialAmounts: initialAmounts,
    keys: ["description", "website"],
    values: ["Test DAO for StandardFactory", "https://test.dao"]
  };

  const govParams = {
    votingDelay: 1,              // 1 block delay
    votingPeriod: 50,            // ~50 blocks
    proposalThreshold: ethers.parseEther("100"),  // 100 tokens to propose
    quorumFraction: 4            // 4% quorum
  };

  console.log("\nDAO Parameters:");
  console.log("  Name:", daoParams.name);
  console.log("  Symbol:", daoParams.symbol);
  console.log("  Initial Members:", initialMembers.length);
  console.log("  Total Supply:", ethers.formatEther(initialAmounts.reduce((a, b) => a + b, 0n)), "tokens");
  console.log("\nGovernance Parameters:");
  console.log("  Voting Delay:", govParams.votingDelay, "blocks");
  console.log("  Voting Period:", govParams.votingPeriod, "blocks");
  console.log("  Proposal Threshold:", ethers.formatEther(govParams.proposalThreshold), "tokens");
  console.log("  Quorum:", govParams.quorumFraction, "%");

  console.log("\nDeploying DAO...");
  const tx = await standardFactory.deployDAOwithToken(daoParams, govParams);
  console.log("Transaction submitted:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("\nDAO deployed successfully!");
  console.log("Block number:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Parse the NewDaoCreated event
  const newDaoCreatedEvent = receipt.logs.find(log => {
    try {
      const parsed = standardFactory.interface.parseLog(log);
      return parsed && parsed.name === 'NewDaoCreated';
    } catch {
      return false;
    }
  });

  if (newDaoCreatedEvent) {
    const parsed = standardFactory.interface.parseLog(newDaoCreatedEvent);
    console.log("\nNewDaoCreated Event:");
    console.log("  DAO Address:", parsed.args.dao);
    console.log("  Token Address:", parsed.args.token);
    console.log("  Registry Address:", parsed.args.registry);
    console.log("  Name:", parsed.args.name);
    console.log("  Symbol:", parsed.args.symbol);
    console.log("  Description:", parsed.args.description);

    // Get the number of DAOs deployed
    const numDAOs = await standardFactory.getNumberOfDAOs();
    console.log("\nTotal DAOs deployed through this factory:", numDAOs.toString());

    console.log("\nNext steps:");
    console.log("1. Check indexer logs to verify NewDaoCreated event was captured");
    console.log("2. Delegate voting power to enable proposals");
    console.log("3. Create and vote on test proposals");
    console.log("4. Verify full governance flow works correctly");
  } else {
    console.log("\nWarning: NewDaoCreated event not found in transaction receipt");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

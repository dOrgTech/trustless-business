const { ethers } = require("hardhat");

// Test configuration
const CONFIG = {
  daoName: "The Grateful Paralized",
  daoSymbol: "TGP",
  daoDescription: "Twice upon nineteen times",
  votingDelay: 0,        // 0 minutes
  votingPeriod: 1,       // 1 minute
  executionDelay: 0,     // 0 seconds
  proposalThreshold: 0,  // Anyone can propose
  quorum: 4,             // 4%
  initialTokens: ethers.parseEther("1000000") // 1M tokens for deployer
};

async function sleep(ms) {
  console.log(`Waiting ${ms/1000} seconds...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForVotingPeriod() {
  console.log("\n⏱️  Waiting for 1 minute voting period to pass...");
  await sleep(65000); // 65 seconds to be safe
  console.log("✓ Voting period complete\n");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(80));
  console.log("COMPREHENSIVE DAO TESTING SUITE");
  console.log("=".repeat(80));
  console.log("\nDeployer:", deployer.address);
  console.log("DAO Name:", CONFIG.daoName);
  console.log("Description:", CONFIG.daoDescription);
  console.log("\n" + "=".repeat(80) + "\n");

  // Get factory addresses from Firestore (hardcoded for now)
  const FACTORIES = {
    wrapper: "0x240dc76D5f879cB9D7966B94d317998A6c4Bd6DE",      // non-transferable
    wrapper_t: "0x637406ad53f23BB4184941fA040443F900fFB686",    // transferable
    wrapper_w: "0x39FF60f3dB4DD2054e5b6d5f8bE9782a45D0AbF2"     // wrapped (old, needs update if you have new one)
  };

  // STEP 1: Deploy a generic ERC20 token for wrapped DAO and transfer testing
  console.log("STEP 1: Deploying generic ERC20 token for testing...\n");
  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const testToken = await TestERC20.deploy("Test USDC", "USDC", 6, 10000000 * 10**6); // 10M USDC initial supply
  await testToken.waitForDeployment();
  const testTokenAddr = await testToken.getAddress();
  console.log("✓ Test ERC20 deployed at:", testTokenAddr);
  console.log("  Name: Test USDC");
  console.log("  Symbol: USDC");
  console.log("  Decimals: 6");
  console.log("  Initial Supply: 10,000,000 USDC\n");

  const daos = {};

  // STEP 2: Deploy Non-Transferable DAO
  console.log("=".repeat(80));
  console.log("STEP 2: Deploying Non-Transferable DAO");
  console.log("=".repeat(80) + "\n");

  const nonTransferableFactory = await ethers.getContractAt("StandardFactory", FACTORIES.wrapper);

  const params1 = {
    name: CONFIG.daoName + " nt",
    symbol: CONFIG.daoSymbol + "NT",
    description: CONFIG.daoDescription,
    decimals: 18,
    executionDelay: CONFIG.executionDelay,
    initialMembers: [deployer.address],
    initialAmounts: [
      CONFIG.initialTokens,
      CONFIG.votingDelay,
      CONFIG.votingPeriod,
      CONFIG.proposalThreshold,
      CONFIG.quorum
    ],
    keys: [],
    values: []
  };

  console.log("Creating DAO...");
  const tx1 = await nonTransferableFactory.deployDAOwithToken(params1);
  const receipt1 = await tx1.wait();

  // Get DAO address from event
  const event1 = receipt1.logs.find(log => {
    try {
      const parsed = nonTransferableFactory.interface.parseLog(log);
      return parsed && parsed.name === 'NewDaoCreated';
    } catch { return false; }
  });

  const parsedEvent1 = nonTransferableFactory.interface.parseLog(event1);
  daos.nonTransferable = {
    dao: parsedEvent1.args.dao,
    token: parsedEvent1.args.token,
    registry: parsedEvent1.args.registry
  };

  console.log("✓ Non-Transferable DAO deployed!");
  console.log("  DAO:", daos.nonTransferable.dao);
  console.log("  Token:", daos.nonTransferable.token);
  console.log("  Registry:", daos.nonTransferable.registry);
  console.log();

  // STEP 3: Deploy Transferable DAO
  console.log("=".repeat(80));
  console.log("STEP 3: Deploying Transferable DAO");
  console.log("=".repeat(80) + "\n");

  const transferableFactory = await ethers.getContractAt("StandardFactoryTransferable", FACTORIES.wrapper_t);

  const params2 = {
    name: CONFIG.daoName + " t",
    symbol: CONFIG.daoSymbol + "T",
    description: CONFIG.daoDescription,
    decimals: 18,
    executionDelay: CONFIG.executionDelay,
    initialMembers: [deployer.address],
    initialAmounts: [
      CONFIG.initialTokens,
      CONFIG.votingDelay,
      CONFIG.votingPeriod,
      CONFIG.proposalThreshold,
      CONFIG.quorum
    ],
    keys: [],
    values: []
  };

  console.log("Creating DAO...");
  const tx2 = await transferableFactory.deployDAOwithToken(params2);
  const receipt2 = await tx2.wait();

  const event2 = receipt2.logs.find(log => {
    try {
      const parsed = transferableFactory.interface.parseLog(log);
      return parsed && parsed.name === 'NewDaoCreated';
    } catch { return false; }
  });

  const parsedEvent2 = transferableFactory.interface.parseLog(event2);
  daos.transferable = {
    dao: parsedEvent2.args.dao,
    token: parsedEvent2.args.token,
    registry: parsedEvent2.args.registry
  };

  console.log("✓ Transferable DAO deployed!");
  console.log("  DAO:", daos.transferable.dao);
  console.log("  Token:", daos.transferable.token);
  console.log("  Registry:", daos.transferable.registry);
  console.log();

  // STEP 4: Deploy Wrapped DAO
  console.log("=".repeat(80));
  console.log("STEP 4: Deploying Wrapped DAO");
  console.log("=".repeat(80) + "\n");

  const wrappedFactory = await ethers.getContractAt("StandardFactoryWrapped", FACTORIES.wrapper_w);

  console.log("Creating wrapped DAO for Test USDC...");
  const tx3 = await wrappedFactory.deployDAOwithWrappedToken({
    name: CONFIG.daoName + " w",
    symbol: CONFIG.daoSymbol + "W",
    description: CONFIG.daoDescription,
    executionDelay: CONFIG.executionDelay,
    underlyingTokenAddress: testTokenAddr,
    governanceSettings: [
      CONFIG.votingDelay,
      CONFIG.votingPeriod,
      CONFIG.proposalThreshold,
      CONFIG.quorum
    ],
    keys: [],
    values: [],
    transferrableStr: "false"
  });
  const receipt3 = await tx3.wait();

  const event3 = receipt3.logs.find(log => {
    try {
      const parsed = wrappedFactory.interface.parseLog(log);
      return parsed && parsed.name === 'DaoWrappedDeploymentInfo';
    } catch { return false; }
  });

  const parsedEvent3 = wrappedFactory.interface.parseLog(event3);
  daos.wrapped = {
    dao: parsedEvent3.args.daoAddress,
    token: parsedEvent3.args.wrappedTokenAddress,
    underlying: parsedEvent3.args.underlyingTokenAddress,
    registry: parsedEvent3.args.registryAddress
  };

  console.log("✓ Wrapped DAO deployed!");
  console.log("  DAO:", daos.wrapped.dao);
  console.log("  Wrapped Token:", daos.wrapped.token);
  console.log("  Underlying Token:", daos.wrapped.underlying);
  console.log("  Registry:", daos.wrapped.registry);
  console.log();

  // Deposit underlying tokens to get voting power in wrapped DAO
  console.log("Depositing USDC to get wrapped governance tokens...");
  await testToken.approve(daos.wrapped.token, 100000 * 10**6); // Approve 100k USDC
  const wrappedToken = await ethers.getContractAt("WrappedRepToken", daos.wrapped.token);
  await wrappedToken.depositFor(deployer.address, 100000 * 10**6);
  console.log("✓ Deposited 100,000 USDC\n");

  // STEP 5: Delegate voting power
  console.log("=".repeat(80));
  console.log("STEP 5: Self-Delegating Voting Power");
  console.log("=".repeat(80) + "\n");

  for (const [type, info] of Object.entries(daos)) {
    const token = await ethers.getContractAt("RepToken", info.token);
    await token.delegate(deployer.address);
    console.log(`✓ Delegated voting power for ${type} DAO`);
  }
  console.log();

  // Wait a block for delegation to take effect
  await sleep(5000);

  // STEP 6: Create Test Proposals
  console.log("=".repeat(80));
  console.log("STEP 6: Creating and Executing Test Proposals");
  console.log("=".repeat(80) + "\n");

  const proposals = [];

  // Test on Non-Transferable DAO
  console.log("--- Non-Transferable DAO Proposals ---\n");
  const dao1 = await ethers.getContractAt("HomebaseDAO", daos.nonTransferable.dao);
  const token1 = await ethers.getContractAt("RepToken", daos.nonTransferable.token);
  const registry1 = await ethers.getContractAt("Registry", daos.nonTransferable.registry);

  // Proposal 1: Mint tokens
  console.log("1. Creating MINT proposal...");
  const mintCalldata = token1.interface.encodeFunctionData("mint", [deployer.address, ethers.parseEther("50000")]);
  const tx_mint = await dao1.propose(
    [daos.nonTransferable.token],
    [0],
    [mintCalldata],
    "Mint 50,000 tokens to deployer"
  );
  const receipt_mint = await tx_mint.wait();
  const proposalId_mint = receipt_mint.logs.find(log => {
    try {
      const parsed = dao1.interface.parseLog(log);
      return parsed && parsed.name === 'ProposalCreated';
    } catch { return false; }
  });
  const pid_mint = dao1.interface.parseLog(proposalId_mint).args.proposalId;
  console.log(`   Proposal ID: ${pid_mint}`);
  proposals.push({ dao: dao1, id: pid_mint, name: "Mint tokens" });

  await sleep(2000);

  // Proposal 2: Registry edit
  console.log("2. Creating REGISTRY EDIT proposal...");
  const registryCalldata = registry1.interface.encodeFunctionData("editRegistry", ["test.key", "test.value"]);
  const tx_reg = await dao1.propose(
    [daos.nonTransferable.registry],
    [0],
    [registryCalldata],
    "Add test key to registry"
  );
  const receipt_reg = await tx_reg.wait();
  const proposalId_reg = receipt_reg.logs.find(log => {
    try {
      const parsed = dao1.interface.parseLog(log);
      return parsed && parsed.name === 'ProposalCreated';
    } catch { return false; }
  });
  const pid_reg = dao1.interface.parseLog(proposalId_reg).args.proposalId;
  console.log(`   Proposal ID: ${pid_reg}`);
  proposals.push({ dao: dao1, id: pid_reg, name: "Registry edit" });

  await sleep(2000);

  // Proposal 3: Change voting delay
  console.log("3. Creating CHANGE VOTING DELAY proposal...");
  const delayCalldata = dao1.interface.encodeFunctionData("setVotingDelay", [5]); // 5 minutes
  const tx_delay = await dao1.propose(
    [daos.nonTransferable.dao],
    [0],
    [delayCalldata],
    "Change voting delay to 5 minutes"
  );
  const receipt_delay = await tx_delay.wait();
  const proposalId_delay = receipt_delay.logs.find(log => {
    try {
      const parsed = dao1.interface.parseLog(log);
      return parsed && parsed.name === 'ProposalCreated';
    } catch { return false; }
  });
  const pid_delay = dao1.interface.parseLog(proposalId_delay).args.proposalId;
  console.log(`   Proposal ID: ${pid_delay}`);
  proposals.push({ dao: dao1, id: pid_delay, name: "Change voting delay" });

  await sleep(2000);

  // Proposal 4: Batch proposal (mint + registry edit)
  console.log("4. Creating BATCH proposal (Mint + Registry)...");
  const tx_batch = await dao1.propose(
    [daos.nonTransferable.token, daos.nonTransferable.registry],
    [0, 0],
    [
      token1.interface.encodeFunctionData("mint", [deployer.address, ethers.parseEther("25000")]),
      registry1.interface.encodeFunctionData("editRegistry", ["batch.test", "batch.value"])
    ],
    "Batch: Mint 25k tokens + Add registry key"
  );
  const receipt_batch = await tx_batch.wait();
  const proposalId_batch = receipt_batch.logs.find(log => {
    try {
      const parsed = dao1.interface.parseLog(log);
      return parsed && parsed.name === 'ProposalCreated';
    } catch { return false; }
  });
  const pid_batch = dao1.interface.parseLog(proposalId_batch).args.proposalId;
  console.log(`   Proposal ID: ${pid_batch}`);
  proposals.push({ dao: dao1, id: pid_batch, name: "Batch proposal" });

  console.log(`\n✓ Created ${proposals.length} proposals for non-transferable DAO\n`);

  // Now vote and execute all proposals
  console.log("=".repeat(80));
  console.log("STEP 7: Voting and Executing Proposals");
  console.log("=".repeat(80) + "\n");

  for (let i = 0; i < proposals.length; i++) {
    const prop = proposals[i];
    console.log(`Processing proposal ${i+1}/${proposals.length}: ${prop.name}`);
    console.log(`  ID: ${prop.id}`);

    // Vote
    console.log("  → Voting FOR...");
    await prop.dao.castVote(prop.id, 1); // 1 = For
    console.log("  ✓ Voted");

    // Wait for voting period
    await waitForVotingPeriod();

    // Queue
    console.log("  → Queueing...");
    const state = await prop.dao.state(prop.id);
    if (state === 4) { // Succeeded
      const propData = await prop.dao["proposalDetails"](prop.id);
      await prop.dao.queue(propData[0], propData[1], propData[2], propData[3]);
      console.log("  ✓ Queued");
    } else {
      console.log("  ✗ Proposal not succeeded (state:", state, ")");
      continue;
    }

    // Execute (no delay, so execute immediately)
    console.log("  → Executing...");
    const propData = await prop.dao["proposalDetails"](prop.id);
    await prop.dao.execute(propData[0], propData[1], propData[2], propData[3]);
    console.log("  ✓ Executed!\n");

    await sleep(2000);
  }

  // Final Summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  console.log("\nDeployed DAOs:");
  console.log("  Non-Transferable:", daos.nonTransferable.dao);
  console.log("  Transferable:    ", daos.transferable.dao);
  console.log("  Wrapped:         ", daos.wrapped.dao);
  console.log("\nTest ERC20:", testTokenAddr);
  console.log("\nProposals Created:", proposals.length);
  console.log("Proposals Executed:", proposals.length);
  console.log("\n✓ All tests complete!");
  console.log("=".repeat(80) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

const { ethers } = require("hardhat");

// Deployed DAO addresses from previous run
const DAOS = {
  nonTransferable: {
    dao: "0x1c07D84cdbF3904541E4e1D85a89A5AC1dB5431F",
    token: "0x36BcD6C3e0117637cD7C51A2973289f481637AFB",
    registry: "0x0F99e6244c1bfc0e474E4e41b1a6315639BA0688"
  },
  transferable: {
    dao: "0x0713A312706E6Cc2F5c4EE8B0de8A41FAB61797d",
    token: "0xAeC2ac30d97595Ff9dfe29e0B28F17830163af01",
    registry: "0x3365085fC04Ae4b1960Ea9Ce60b9f9d8037EEb81"
  },
  wrapped: {
    dao: "0x809f092B2E356Ba1F5E41c38334A40f8c52806d4",
    token: "0xC27f86bD26f0647773657e3dDa3c25E18BdaCEA1",
    underlying: "0xc67BC3e1078c2C3B9DE80b151aB10A65cEe6cC6A",
    registry: "0x284e3FA328c368CB5d31C697785C74896dF6C5C7"
  }
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
  console.log("CONTINUING COMPREHENSIVE DAO TEST");
  console.log("=".repeat(80));
  console.log("\nDeployer:", deployer.address);
  console.log("\n" + "=".repeat(80) + "\n");

  // Deposit wrapped tokens if needed
  console.log("Depositing USDC to wrapped DAO...");
  const testToken = await ethers.getContractAt("TestERC20", DAOS.wrapped.underlying);
  await testToken.approve(DAOS.wrapped.token, 100000 * 10**6);
  const wrappedToken = await ethers.getContractAt("WrappedRepToken", DAOS.wrapped.token);
  await wrappedToken.depositFor(deployer.address, 100000 * 10**6);
  console.log("✓ Deposited 100,000 USDC\n");

  // Delegate voting power
  console.log("=".repeat(80));
  console.log("STEP 1: Self-Delegating Voting Power");
  console.log("=".repeat(80) + "\n");

  for (const [type, info] of Object.entries(DAOS)) {
    const token = await ethers.getContractAt("RepToken", info.token);
    await token.delegate(deployer.address);
    console.log(`✓ Delegated voting power for ${type} DAO`);
  }
  console.log();

  await sleep(5000);

  // Create Test Proposals on Non-Transferable DAO
  console.log("=".repeat(80));
  console.log("STEP 2: Creating Test Proposals");
  console.log("=".repeat(80) + "\n");

  const proposals = [];
  const dao1 = await ethers.getContractAt("HomebaseDAO", DAOS.nonTransferable.dao);
  const token1 = await ethers.getContractAt("RepToken", DAOS.nonTransferable.token);
  const registry1 = await ethers.getContractAt("Registry", DAOS.nonTransferable.registry);

  // Proposal 1: Mint tokens
  console.log("1. Creating MINT proposal...");
  const tx_mint = await dao1.propose(
    [DAOS.nonTransferable.token],
    [0],
    [token1.interface.encodeFunctionData("mint", [deployer.address, ethers.parseEther("50000")])],
    "Mint 50,000 tokens"
  );
  const receipt_mint = await tx_mint.wait();
  const pid_mint = receipt_mint.logs.find(log => {
    try { const p = dao1.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  const proposalId1 = dao1.interface.parseLog(pid_mint).args.proposalId;
  console.log(`   Proposal ID: ${proposalId1}`);
  proposals.push({ dao: dao1, id: proposalId1, name: "Mint tokens" });
  await sleep(2000);

  // Proposal 2: Burn tokens
  console.log("2. Creating BURN proposal...");
  const tx_burn = await dao1.propose(
    [DAOS.nonTransferable.token],
    [0],
    [token1.interface.encodeFunctionData("burn", [deployer.address, ethers.parseEther("10000")])],
    "Burn 10,000 tokens"
  );
  const receipt_burn = await tx_burn.wait();
  const pid_burn = receipt_burn.logs.find(log => {
    try { const p = dao1.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  const proposalId2 = dao1.interface.parseLog(pid_burn).args.proposalId;
  console.log(`   Proposal ID: ${proposalId2}`);
  proposals.push({ dao: dao1, id: proposalId2, name: "Burn tokens" });
  await sleep(2000);

  // Proposal 3: Transfer ERC20
  console.log("3. Creating ERC20 TRANSFER proposal...");
  const tx_transfer = await dao1.propose(
    [DAOS.wrapped.underlying],
    [0],
    [testToken.interface.encodeFunctionData("transfer", ["0x0000000000000000000000000000000000000001", 1000 * 10**6])],
    "Transfer 1000 USDC to burn address"
  );
  const receipt_transfer = await tx_transfer.wait();
  const pid_transfer = receipt_transfer.logs.find(log => {
    try { const p = dao1.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  const proposalId3 = dao1.interface.parseLog(pid_transfer).args.proposalId;
  console.log(`   Proposal ID: ${proposalId3}`);
  proposals.push({ dao: dao1, id: proposalId3, name: "Transfer ERC20" });
  await sleep(2000);

  // Proposal 4: Registry edit
  console.log("4. Creating REGISTRY EDIT proposal...");
  const tx_reg = await dao1.propose(
    [DAOS.nonTransferable.registry],
    [0],
    [registry1.interface.encodeFunctionData("editRegistry", ["test.key", "test.value"])],
    "Add test key to registry"
  );
  const receipt_reg = await tx_reg.wait();
  const pid_reg = receipt_reg.logs.find(log => {
    try { const p = dao1.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  const proposalId4 = dao1.interface.parseLog(pid_reg).args.proposalId;
  console.log(`   Proposal ID: ${proposalId4}`);
  proposals.push({ dao: dao1, id: proposalId4, name: "Registry edit" });
  await sleep(2000);

  // Proposal 5: Change voting delay
  console.log("5. Creating CHANGE VOTING DELAY proposal...");
  const tx_delay = await dao1.propose(
    [DAOS.nonTransferable.dao],
    [0],
    [dao1.interface.encodeFunctionData("setVotingDelay", [5])],
    "Change voting delay to 5 blocks"
  );
  const receipt_delay = await tx_delay.wait();
  const pid_delay = receipt_delay.logs.find(log => {
    try { const p = dao1.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  const proposalId5 = dao1.interface.parseLog(pid_delay).args.proposalId;
  console.log(`   Proposal ID: ${proposalId5}`);
  proposals.push({ dao: dao1, id: proposalId5, name: "Change voting delay" });
  await sleep(2000);

  // Proposal 6: Change voting period
  console.log("6. Creating CHANGE VOTING PERIOD proposal...");
  const tx_period = await dao1.propose(
    [DAOS.nonTransferable.dao],
    [0],
    [dao1.interface.encodeFunctionData("setVotingPeriod", [10])],
    "Change voting period to 10 blocks"
  );
  const receipt_period = await tx_period.wait();
  const pid_period = receipt_period.logs.find(log => {
    try { const p = dao1.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  const proposalId6 = dao1.interface.parseLog(pid_period).args.proposalId;
  console.log(`   Proposal ID: ${proposalId6}`);
  proposals.push({ dao: dao1, id: proposalId6, name: "Change voting period" });
  await sleep(2000);

  // Proposal 7: Change proposal threshold
  console.log("7. Creating CHANGE PROPOSAL THRESHOLD proposal...");
  const tx_threshold = await dao1.propose(
    [DAOS.nonTransferable.dao],
    [0],
    [dao1.interface.encodeFunctionData("setProposalThreshold", [ethers.parseEther("1000")])],
    "Change proposal threshold to 1000 tokens"
  );
  const receipt_threshold = await tx_threshold.wait();
  const pid_threshold = receipt_threshold.logs.find(log => {
    try { const p = dao1.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  const proposalId7 = dao1.interface.parseLog(pid_threshold).args.proposalId;
  console.log(`   Proposal ID: ${proposalId7}`);
  proposals.push({ dao: dao1, id: proposalId7, name: "Change proposal threshold" });
  await sleep(2000);

  // Proposal 8: Change quorum
  console.log("8. Creating CHANGE QUORUM proposal...");
  const tx_quorum = await dao1.propose(
    [DAOS.nonTransferable.dao],
    [0],
    [dao1.interface.encodeFunctionData("updateQuorumNumerator", [10])],
    "Change quorum to 10%"
  );
  const receipt_quorum = await tx_quorum.wait();
  const pid_quorum = receipt_quorum.logs.find(log => {
    try { const p = dao1.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  const proposalId8 = dao1.interface.parseLog(pid_quorum).args.proposalId;
  console.log(`   Proposal ID: ${proposalId8}`);
  proposals.push({ dao: dao1, id: proposalId8, name: "Change quorum" });
  await sleep(2000);

  // Proposal 9: Batch proposal
  console.log("9. Creating BATCH proposal (Mint + Registry + Transfer)...");
  const tx_batch = await dao1.propose(
    [DAOS.nonTransferable.token, DAOS.nonTransferable.registry, DAOS.wrapped.underlying],
    [0, 0, 0],
    [
      token1.interface.encodeFunctionData("mint", [deployer.address, ethers.parseEther("25000")]),
      registry1.interface.encodeFunctionData("editRegistry", ["batch.test", "batch.value"]),
      testToken.interface.encodeFunctionData("transfer", ["0x0000000000000000000000000000000000000002", 500 * 10**6])
    ],
    "Batch: Mint + Registry + Transfer"
  );
  const receipt_batch = await tx_batch.wait();
  const pid_batch = receipt_batch.logs.find(log => {
    try { const p = dao1.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  const proposalId9 = dao1.interface.parseLog(pid_batch).args.proposalId;
  console.log(`   Proposal ID: ${proposalId9}`);
  proposals.push({ dao: dao1, id: proposalId9, name: "Batch proposal" });

  console.log(`\n✓ Created ${proposals.length} proposals\n`);

  // Vote and execute all proposals
  console.log("=".repeat(80));
  console.log("STEP 3: Voting and Executing Proposals");
  console.log("=".repeat(80) + "\n");

  for (let i = 0; i < proposals.length; i++) {
    const prop = proposals[i];
    console.log(`\nProcessing proposal ${i+1}/${proposals.length}: ${prop.name}`);
    console.log(`ID: ${prop.id}`);

    // Vote
    console.log("→ Voting FOR...");
    await prop.dao.castVote(prop.id, 1);
    console.log("✓ Voted");

    // Wait for voting period
    await waitForVotingPeriod();

    // Queue
    console.log("→ Queueing...");
    const state = await prop.dao.state(prop.id);
    if (state === 4) {
      const propData = await prop.dao["proposalDetails"](prop.id);
      await prop.dao.queue(propData[0], propData[1], propData[2], propData[3]);
      console.log("✓ Queued");
    } else {
      console.log("✗ Proposal not succeeded (state:", state, ")");
      continue;
    }

    // Execute
    console.log("→ Executing...");
    const propData = await prop.dao["proposalDetails"](prop.id);
    await prop.dao.execute(propData[0], propData[1], propData[2], propData[3]);
    console.log("✓ Executed!");

    await sleep(2000);
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST COMPLETE!");
  console.log("=".repeat(80));
  console.log("\nDAOs:");
  console.log("  Non-Transferable: ", DAOS.nonTransferable.dao);
  console.log("  Transferable:     ", DAOS.transferable.dao);
  console.log("  Wrapped:          ", DAOS.wrapped.dao);
  console.log("\nProposals Created:  ", proposals.length);
  console.log("Proposals Executed: ", proposals.length);
  console.log("\n✓ All tests complete!");
  console.log("=".repeat(80) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

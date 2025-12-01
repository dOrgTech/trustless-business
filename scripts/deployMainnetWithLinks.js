const { ethers } = require("hardhat");

const CONFIG = {
  daoName: "The Grateful Paralized",
  daoSymbol: "TGP",
  daoDescription: "Twice upon nineteen times",
  votingDelay: 0,
  votingPeriod: 1,
  executionDelay: 0,
  proposalThreshold: 0,
  quorum: 4,
  initialTokens: ethers.parseEther("1000000")
};

const FACTORY_ADDRESS = "0x7309FA5b3a72359ADeb9304113D3B1F7aC93335f"; // Mainnet StandardFactory

function formatDescription(title, type, description, link) {
  // Link is REQUIRED - must be a valid URL, not empty string
  return `${title}0|||0${type}0|||0${description}0|||0${link}`;
}

async function sleep(ms) {
  console.log(`Waiting ${ms/1000} seconds...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForReceipt(tx, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`  Retry ${i + 1}/${maxRetries}...`);
      await sleep(2000);
      try {
        const receipt = await tx.provider.getTransactionReceipt(tx.hash);
        if (receipt) return receipt;
      } catch (e) {
        // Continue retrying
      }
    }
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(80));
  console.log("MAINNET: The Grateful Paralized - Deployment with Proper Links");
  console.log("=".repeat(80));
  console.log("\nDeployer:", deployer.address);
  console.log("Network: Etherlink Mainnet\n");
  console.log("=".repeat(80) + "\n");

  // STEP 1: Deploy Test ERC20
  console.log("STEP 1: Deploying Test ERC20...\n");
  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const testToken = await TestERC20.deploy("Test USDC", "USDC", 6, 10000000 * 10**6);
  await testToken.waitForDeployment();
  const testTokenAddr = await testToken.getAddress();
  console.log("✓ Test USDC:", testTokenAddr, "\n");

  // STEP 2: Deploy DAO
  console.log("STEP 2: Deploying DAO...\n");
  const factory = await ethers.getContractAt("StandardFactory", FACTORY_ADDRESS);

  const tx = await factory.deployDAOwithToken({
    name: CONFIG.daoName,
    symbol: CONFIG.daoSymbol,
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
  });

  console.log("  Transaction hash:", tx.hash);
  console.log("  Waiting for confirmation...");

  const receipt = await waitForReceipt(tx);

  const event = receipt.logs.find(log => {
    try {
      const parsed = factory.interface.parseLog(log);
      return parsed && parsed.name === 'NewDaoCreated';
    } catch { return false; }
  });

  const parsedEvent = factory.interface.parseLog(event);
  const DAO_ADDRESS = parsedEvent.args.dao;
  const TOKEN_ADDRESS = parsedEvent.args.token;
  const REGISTRY_ADDRESS = parsedEvent.args.registry;

  console.log("✓ DAO deployed!");
  console.log("  DAO:", DAO_ADDRESS);
  console.log("  Token:", TOKEN_ADDRESS);
  console.log("  Registry:", REGISTRY_ADDRESS);
  console.log();

  // STEP 3: Self-delegate
  console.log("STEP 3: Self-delegating voting power...\n");
  const token = await ethers.getContractAt("RepToken", TOKEN_ADDRESS);
  const delegateTx = await token.delegate(deployer.address);
  await waitForReceipt(delegateTx);
  console.log("✓ Delegated\n");
  await sleep(5000);

  // STEP 4: Create proposals with PROPER LINKS
  console.log("STEP 4: Creating proposals with proper links...\n");
  const dao = await ethers.getContractAt("HomebaseDAO", DAO_ADDRESS);
  const registry = await ethers.getContractAt("Registry", REGISTRY_ADDRESS);

  const proposals = [];

  // 1. Mint
  console.log("1. MINT proposal...");
  let propTx = await dao.propose(
    [TOKEN_ADDRESS],
    [0],
    [token.interface.encodeFunctionData("mint", [deployer.address, ethers.parseEther("50000")])],
    formatDescription("Mint Additional Tokens", "mint", "Mint 50,000 additional governance tokens to deployer address for community distribution.", "https://homebase.app")
  );
  let propReceipt = await waitForReceipt(propTx);
  let propEvent = propReceipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  let propId = dao.interface.parseLog(propEvent).args.proposalId;
  console.log(`   ID: ${propId}`);
  proposals.push({ id: propId, name: "Mint" });
  await sleep(2000);

  // 2. Burn
  console.log("2. BURN proposal...");
  propTx = await dao.propose(
    [TOKEN_ADDRESS],
    [0],
    [token.interface.encodeFunctionData("burn", [deployer.address, ethers.parseEther("10000")])],
    formatDescription("Burn Excess Tokens", "burn", "Burn 10,000 tokens from deployer address to reduce total supply.", "https://homebase.app")
  );
  propReceipt = await waitForReceipt(propTx);
  propEvent = propReceipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  propId = dao.interface.parseLog(propEvent).args.proposalId;
  console.log(`   ID: ${propId}`);
  proposals.push({ id: propId, name: "Burn" });
  await sleep(2000);

  // 3. Transfer ERC20
  console.log("3. TRANSFER ERC20 proposal...");
  propTx = await dao.propose(
    [testTokenAddr],
    [0],
    [testToken.interface.encodeFunctionData("transfer", ["0x0000000000000000000000000000000000000001", 1000 * 10**6])],
    formatDescription("Transfer USDC", "transfer", "Transfer 1,000 USDC from treasury to burn address for testing purposes.", "https://homebase.app")
  );
  propReceipt = await waitForReceipt(propTx);
  propEvent = propReceipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  propId = dao.interface.parseLog(propEvent).args.proposalId;
  console.log(`   ID: ${propId}`);
  proposals.push({ id: propId, name: "Transfer ERC20" });
  await sleep(2000);

  // 4. Registry edit
  console.log("4. REGISTRY EDIT proposal...");
  propTx = await dao.propose(
    [REGISTRY_ADDRESS],
    [0],
    [registry.interface.encodeFunctionData("editRegistry", ["dao.website", "https://example.com"])],
    formatDescription("Update DAO Website", "registry", "Set the dao.website registry key to our new domain.", "https://homebase.app")
  );
  propReceipt = await waitForReceipt(propTx);
  propEvent = propReceipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  propId = dao.interface.parseLog(propEvent).args.proposalId;
  console.log(`   ID: ${propId}`);
  proposals.push({ id: propId, name: "Registry edit" });
  await sleep(2000);

  // 5. Batch DAO config (voting period, voting delay, proposal threshold, quorum)
  console.log("5. BATCH DAO CONFIG proposal...");
  propTx = await dao.propose(
    [DAO_ADDRESS, DAO_ADDRESS, DAO_ADDRESS, DAO_ADDRESS],
    [0, 0, 0, 0],
    [
      dao.interface.encodeFunctionData("setVotingPeriod", [10080]), // 7 days
      dao.interface.encodeFunctionData("setVotingDelay", [5]), // 5 minutes
      dao.interface.encodeFunctionData("setProposalThreshold", [ethers.parseEther("1000")]),
      dao.interface.encodeFunctionData("updateQuorumNumerator", [10]) // 10%
    ],
    formatDescription("Update DAO Parameters", "batch", "Batch update: Set voting period to 7 days, voting delay to 5 minutes, proposal threshold to 1000 tokens, and quorum to 10%.", "https://homebase.app")
  );
  propReceipt = await waitForReceipt(propTx);
  propEvent = propReceipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  propId = dao.interface.parseLog(propEvent).args.proposalId;
  console.log(`   ID: ${propId}`);
  proposals.push({ id: propId, name: "Batch config" });

  console.log(`\n✓ Created ${proposals.length} proposals\n`);

  // STEP 5: Wait 10 seconds then vote
  console.log("STEP 5: Waiting 10 seconds for voting window...\n");
  await sleep(10000);

  console.log("STEP 6: Voting YES on all proposals...\n");
  for (const prop of proposals) {
    console.log(`Voting on ${prop.name}...`);
    const voteTx = await dao.castVote(prop.id, 1); // 1 = For
    await waitForReceipt(voteTx);
    console.log(`  ✓ Voted`);
    await sleep(1000);
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("DEPLOYMENT & VOTING COMPLETE");
  console.log("=".repeat(80));
  console.log("\nDAO Address:", DAO_ADDRESS);
  console.log("Token Address:", TOKEN_ADDRESS);
  console.log("Registry Address:", REGISTRY_ADDRESS);
  console.log("Test ERC20:", testTokenAddr);
  console.log("\nProposals created:", proposals.length);
  console.log("Votes cast:", proposals.length);
  console.log("\nProposal IDs:");
  proposals.forEach((p, i) => {
    console.log(`${i+1}. ${p.name}: ${p.id}`);
  });
  console.log("\nNext steps:");
  console.log("1. Wait 1 minute for voting period to end");
  console.log("2. Queue proposals via web app");
  console.log("3. Execute proposals via web app");
  console.log("\n" + "=".repeat(80) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

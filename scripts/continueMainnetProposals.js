const { ethers } = require("hardhat");

// Deployed addresses from logs and deployment tx
const DAO_ADDRESS = "0xb156BD3188f5A93b38842aA5dDE65d41F32944d6";
const TOKEN_ADDRESS = "0x4cB8E533F3a81485F55c85a8CAE7c2d2AB554C69";
const REGISTRY_ADDRESS = "0x8F9fB3424926a8A6D106c71d90610F23EbBeB75f";
const TEST_ERC20_ADDRESS = "0x2DFd7BA484B6363Be2c9a3fAA6cab162B2f6D088";

function formatDescription(title, type, description, link = "") {
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
  console.log("MAINNET: Creating Proposals and Voting");
  console.log("=".repeat(80));
  console.log("\nDAO:", DAO_ADDRESS);
  console.log("Deployer:", deployer.address, "\n");

  const dao = await ethers.getContractAt("HomebaseDAO", DAO_ADDRESS);
  const token = await ethers.getContractAt("RepToken", TOKEN_ADDRESS);
  const testToken = await ethers.getContractAt("TestERC20", TEST_ERC20_ADDRESS);
  const registry = await ethers.getContractAt("Registry", REGISTRY_ADDRESS);

  console.log("Registry:", REGISTRY_ADDRESS, "\n");

  const proposals = [];

  // Create proposals
  console.log("Creating proposals...\n");

  // 1. Mint
  console.log("1. MINT proposal...");
  let propTx = await dao.propose(
    [TOKEN_ADDRESS],
    [0],
    [token.interface.encodeFunctionData("mint", [deployer.address, ethers.parseEther("50000")])],
    formatDescription("Mint Additional Tokens", "mint", "Mint 50,000 additional governance tokens to deployer address for community distribution.", "")
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
    formatDescription("Burn Excess Tokens", "burn", "Burn 10,000 tokens from deployer address to reduce total supply.", "")
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
    [TEST_ERC20_ADDRESS],
    [0],
    [testToken.interface.encodeFunctionData("transfer", ["0x0000000000000000000000000000000000000001", 1000 * 10**6])],
    formatDescription("Transfer USDC", "transfer", "Transfer 1,000 USDC from treasury to burn address for testing purposes.", "")
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
    formatDescription("Update DAO Website", "registry", "Set the dao.website registry key to our new domain.", "")
  );
  propReceipt = await waitForReceipt(propTx);
  propEvent = propReceipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  propId = dao.interface.parseLog(propEvent).args.proposalId;
  console.log(`   ID: ${propId}`);
  proposals.push({ id: propId, name: "Registry edit" });
  await sleep(2000);

  // 5. Batch DAO config
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
    formatDescription("Update DAO Parameters", "batch", "Batch update: Set voting period to 7 days, voting delay to 5 minutes, proposal threshold to 1000 tokens, and quorum to 10%.", "")
  );
  propReceipt = await waitForReceipt(propTx);
  propEvent = propReceipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  propId = dao.interface.parseLog(propEvent).args.proposalId;
  console.log(`   ID: ${propId}`);
  proposals.push({ id: propId, name: "Batch config" });

  console.log(`\n✓ Created ${proposals.length} proposals\n`);

  // Wait 10 seconds then vote
  console.log("Waiting 10 seconds for voting window...\n");
  await sleep(10000);

  console.log("Voting YES on all proposals...\n");
  for (const prop of proposals) {
    console.log(`Voting on ${prop.name}...`);
    const voteTx = await dao.castVote(prop.id, 1); // 1 = For
    await waitForReceipt(voteTx);
    console.log(`  ✓ Voted`);
    await sleep(1000);
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("PROPOSALS CREATED & VOTED");
  console.log("=".repeat(80));
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

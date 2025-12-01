const { ethers } = require("hardhat");

// Non-Transferable DAO from deployment
const DAO_ADDRESS = "0x1c07D84cdbF3904541E4e1D85a89A5AC1dB5431F";
const TOKEN_ADDRESS = "0x36BcD6C3e0117637cD7C51A2973289f481637AFB";
const REGISTRY_ADDRESS = "0x0F99e6244c1bfc0e474E4e41b1a6315639BA0688";
const TEST_ERC20_ADDRESS = "0xc67BC3e1078c2C3B9DE80b151aB10A65cEe6cC6A"; // Test USDC

async function sleep(ms) {
  console.log(`Waiting ${ms/1000} seconds...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(80));
  console.log("TESTING NON-TRANSFERABLE DAO: The Grateful Paralized nt");
  console.log("=".repeat(80));
  console.log("\nDAO:", DAO_ADDRESS);
  console.log("Deployer:", deployer.address, "\n");

  const dao = await ethers.getContractAt("HomebaseDAO", DAO_ADDRESS);
  const token = await ethers.getContractAt("RepToken", TOKEN_ADDRESS);
  const registry = await ethers.getContractAt("Registry", REGISTRY_ADDRESS);
  const testToken = await ethers.getContractAt("TestERC20", TEST_ERC20_ADDRESS);

  const proposals = [];

  // Create all proposals first
  console.log("Creating proposals...\n");

  // 1. Mint
  console.log("1. MINT proposal...");
  let tx = await dao.propose(
    [TOKEN_ADDRESS],
    [0],
    [token.interface.encodeFunctionData("mint", [deployer.address, ethers.parseEther("50000")])],
    "Mint 50k tokens"
  );
  let receipt = await tx.wait();
  let event = receipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  let pid = dao.interface.parseLog(event).args.proposalId;
  console.log(`   ID: ${pid}\n`);
  proposals.push({ id: pid, name: "Mint" });
  await sleep(2000);

  // 2. Burn
  console.log("2. BURN proposal...");
  tx = await dao.propose(
    [TOKEN_ADDRESS],
    [0],
    [token.interface.encodeFunctionData("burn", [deployer.address, ethers.parseEther("10000")])],
    "Burn 10k tokens"
  );
  receipt = await tx.wait();
  event = receipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  pid = dao.interface.parseLog(event).args.proposalId;
  console.log(`   ID: ${pid}\n`);
  proposals.push({ id: pid, name: "Burn" });
  await sleep(2000);

  // 3. Transfer ERC20
  console.log("3. TRANSFER ERC20 proposal...");
  tx = await dao.propose(
    [TEST_ERC20_ADDRESS],
    [0],
    [testToken.interface.encodeFunctionData("transfer", ["0x0000000000000000000000000000000000000001", 1000 * 10**6])],
    "Transfer 1000 USDC"
  );
  receipt = await tx.wait();
  event = receipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  pid = dao.interface.parseLog(event).args.proposalId;
  console.log(`   ID: ${pid}\n`);
  proposals.push({ id: pid, name: "Transfer ERC20" });
  await sleep(2000);

  // 4. Registry edit
  console.log("4. REGISTRY EDIT proposal...");
  tx = await dao.propose(
    [REGISTRY_ADDRESS],
    [0],
    [registry.interface.encodeFunctionData("editRegistry", ["test.key", "test.value"])],
    "Add registry key"
  );
  receipt = await tx.wait();
  event = receipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  pid = dao.interface.parseLog(event).args.proposalId;
  console.log(`   ID: ${pid}\n`);
  proposals.push({ id: pid, name: "Registry edit" });
  await sleep(2000);

  // 5. Change voting delay
  console.log("5. CHANGE VOTING DELAY proposal...");
  tx = await dao.propose(
    [DAO_ADDRESS],
    [0],
    [dao.interface.encodeFunctionData("setVotingDelay", [5])],
    "Set voting delay to 5"
  );
  receipt = await tx.wait();
  event = receipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  pid = dao.interface.parseLog(event).args.proposalId;
  console.log(`   ID: ${pid}\n`);
  proposals.push({ id: pid, name: "Change voting delay" });
  await sleep(2000);

  // 6. Change voting period
  console.log("6. CHANGE VOTING PERIOD proposal...");
  tx = await dao.propose(
    [DAO_ADDRESS],
    [0],
    [dao.interface.encodeFunctionData("setVotingPeriod", [10])],
    "Set voting period to 10"
  );
  receipt = await tx.wait();
  event = receipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  pid = dao.interface.parseLog(event).args.proposalId;
  console.log(`   ID: ${pid}\n`);
  proposals.push({ id: pid, name: "Change voting period" });
  await sleep(2000);

  // 7. Change proposal threshold
  console.log("7. CHANGE PROPOSAL THRESHOLD proposal...");
  tx = await dao.propose(
    [DAO_ADDRESS],
    [0],
    [dao.interface.encodeFunctionData("setProposalThreshold", [ethers.parseEther("1000")])],
    "Set threshold to 1000"
  );
  receipt = await tx.wait();
  event = receipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  pid = dao.interface.parseLog(event).args.proposalId;
  console.log(`   ID: ${pid}\n`);
  proposals.push({ id: pid, name: "Change proposal threshold" });
  await sleep(2000);

  // 8. Change quorum
  console.log("8. CHANGE QUORUM proposal...");
  tx = await dao.propose(
    [DAO_ADDRESS],
    [0],
    [dao.interface.encodeFunctionData("updateQuorumNumerator", [10])],
    "Set quorum to 10%"
  );
  receipt = await tx.wait();
  event = receipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  pid = dao.interface.parseLog(event).args.proposalId;
  console.log(`   ID: ${pid}\n`);
  proposals.push({ id: pid, name: "Change quorum" });
  await sleep(2000);

  // 9. Batch proposal
  console.log("9. BATCH proposal (Mint + Registry + Transfer)...");
  tx = await dao.propose(
    [TOKEN_ADDRESS, REGISTRY_ADDRESS, TEST_ERC20_ADDRESS],
    [0, 0, 0],
    [
      token.interface.encodeFunctionData("mint", [deployer.address, ethers.parseEther("25000")]),
      registry.interface.encodeFunctionData("editRegistry", ["batch.key", "batch.value"]),
      testToken.interface.encodeFunctionData("transfer", ["0x0000000000000000000000000000000000000002", 500 * 10**6])
    ],
    "Batch: Mint + Registry + Transfer"
  );
  receipt = await tx.wait();
  event = receipt.logs.find(log => {
    try { const p = dao.interface.parseLog(log); return p && p.name === 'ProposalCreated'; } catch { return false; }
  });
  pid = dao.interface.parseLog(event).args.proposalId;
  console.log(`   ID: ${pid}\n`);
  proposals.push({ id: pid, name: "Batch" });

  console.log("\n" + "=".repeat(80));
  console.log(`✓ Created ${proposals.length} proposals!`);
  console.log("=".repeat(80));
  console.log("\nProposal IDs:");
  proposals.forEach((p, i) => {
    console.log(`${i+1}. ${p.name}: ${p.id}`);
  });
  console.log("\n" + "=".repeat(80));
  console.log("You can now vote and execute these proposals from the web app!");
  console.log("=".repeat(80) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

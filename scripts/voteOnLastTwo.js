const { ethers } = require("hardhat");

const DAO_ADDRESS = "0xb156BD3188f5A93b38842aA5dDE65d41F32944d6";

// Last 2 proposals that need votes
const PROPOSALS = [
  { id: "98039281934749752395429252799560126723867851928453474412685090454998022298455", name: "Registry Edit" },
  { id: "29634190499073395858212799177947320601761925089182435645207742870246858915702", name: "Batch DAO Config" }
];

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
  console.log("Voting on last 2 proposals...\n");
  console.log("DAO:", DAO_ADDRESS);
  console.log("Deployer:", deployer.address, "\n");

  const dao = await ethers.getContractAt("HomebaseDAO", DAO_ADDRESS);

  for (const prop of PROPOSALS) {
    console.log(`${prop.name}:`);

    // Check state
    const state = await dao.state(prop.id);
    console.log(`  State: ${state} (1=Active, 4=Succeeded)`);

    // Check if already voted
    const hasVoted = await dao.hasVoted(prop.id, deployer.address);

    if (hasVoted) {
      console.log(`  ✓ Already voted\n`);
    } else if (state === 1n) {
      console.log(`  → Voting YES...`);
      const voteTx = await dao.castVote(prop.id, 1); // 1 = For
      await waitForReceipt(voteTx);
      console.log(`  ✓ Voted\n`);
      await sleep(1000);
    } else {
      console.log(`  ✗ Voting period ended (state: ${state})\n`);
    }
  }

  console.log("=".repeat(80));
  console.log("Summary: All 5 proposals created on mainnet DAO");
  console.log("Next: Wait for voting period to end, then queue & execute via web app");
  console.log("=".repeat(80) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

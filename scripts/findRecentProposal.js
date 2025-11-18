const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0x11B14fD23557cE18c8faa89F7D2c21B1f951af2e";
  const proposalId = "25129221281538011219754517157172944762813024215562046079309328385989039257248";
  
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);
  
  const currentBlock = await ethers.provider.getBlockNumber();
  console.log("Current block:", currentBlock);
  
  // Search last 1000 blocks
  const searchFrom = currentBlock - 1000;
  console.log("Searching blocks", searchFrom, "to", currentBlock);
  
  const filter = dao.filters.ProposalCreated();
  const events = await dao.queryFilter(filter, searchFrom, currentBlock);
  
  console.log(`\nFound ${events.length} ProposalCreated events\n`);
  
  for (const event of events) {
    const pid = event.args.proposalId.toString();
    console.log("Proposal ID:", pid);
    console.log("Block:", event.blockNumber);
    
    if (pid === proposalId) {
      console.log("✓ THIS IS OUR PROPOSAL");
      console.log("Tx:", event.transactionHash);
      console.log("Description:", event.args.description);
    }
    console.log();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

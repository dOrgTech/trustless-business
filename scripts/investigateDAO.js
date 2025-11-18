const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0x4aC871347Fa3AA5e56ab1Fd0F4DD0b72d1FA65a8";
  const proposalId = "98344160627597814715866982142171914871789601251130668984272948727884684254570";

  console.log("Investigating DAO:", daoAddress);
  console.log("Proposal ID:", proposalId, "\n");

  // Get DAO contract
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);

  // Get token address
  const tokenAddress = await dao.token();
  console.log("Token address:", tokenAddress);

  // Check token contract
  const token = await ethers.getContractAt("RepToken", tokenAddress);

  // Check if token has mint function and admin
  try {
    const hasAdmin = await token.admin();
    console.log("Token admin:", hasAdmin);

    const isTransferable = await token.isTransferable();
    console.log("Token isTransferable:", isTransferable);
  } catch (e) {
    console.log("ERROR checking token:", e.message);
  }

  // Check timelock
  const timelockAddress = await dao.timelock();
  console.log("Timelock address:", timelockAddress);

  // Get proposal state
  const state = await dao.state(proposalId);
  const stateNames = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"];
  console.log("Proposal state:", stateNames[state]);

  // Get proposal details
  try {
    const proposalData = await dao.proposals(proposalId);
    console.log("\nProposal snapshot:", proposalData);
  } catch (e) {
    console.log("Could not get proposal data:", e.message);
  }

  // Try to get proposal actions via event
  console.log("\nFetching proposal creation event...");
  const filter = dao.filters.ProposalCreated(proposalId);
  const events = await dao.queryFilter(filter);

  if (events.length > 0) {
    const event = events[0];
    console.log("Proposal details from event:");
    console.log("  Targets:", event.args.targets);
    console.log("  Values:", event.args.values.map(v => v.toString()));
    console.log("  Calldatas:", event.args.calldatas);

    // Decode calldata
    const iface = new ethers.Interface(["function mint(address to, uint256 amount)"]);
    try {
      const decoded = iface.decodeFunctionData("mint", event.args.calldatas[0]);
      console.log("\nDecoded mint call:");
      console.log("  To:", decoded[0]);
      console.log("  Amount:", decoded[1].toString());
    } catch (e) {
      console.log("Could not decode calldata:", e.message);
    }

    // Try to execute with staticCall to see the error
    if (state === 5) { // Queued
      console.log("\nAttempting static call to execute...");
      try {
        await dao.execute.staticCall(
          event.args.targets,
          event.args.values,
          event.args.calldatas,
          event.args.descriptionHash
        );
        console.log("✓ Execution would succeed!");
      } catch (error) {
        console.log("✗ Execution would fail:");
        console.log("  Error:", error.message);
        if (error.data) {
          console.log("  Error data:", error.data);
        }
      }
    }
  } else {
    console.log("No ProposalCreated event found!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

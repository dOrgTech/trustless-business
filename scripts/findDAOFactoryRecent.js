const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0x4aC871347Fa3AA5e56ab1Fd0F4DD0b72d1FA65a8";

  console.log("Searching for factory that created DAO:", daoAddress, "\n");

  const currentBlock = await ethers.provider.getBlockNumber();
  console.log("Current block:", currentBlock);
  const fromBlock = currentBlock - 1000; // Last 1000 blocks
  console.log("Searching from block:", fromBlock, "\n");

  const factories = [
    { name: "NEW StandardFactory", address: "0x4962e5cCBfE4258B9229bfff705cCacA4379f49f" },
    { name: "NEW StandardFactoryWrapped", address: "0x39FF60f3dB4DD2054e5b6d5f8bE9782a45D0AbF2" },
    { name: "OLD wrapper_jurisdiction", address: "0xc558cD4e3Fa91C51141ab0E6Cd77b5Fe94B0B002" },
    { name: "OLD wrapper_w", address: "0x422657c7620Dde17Ca9439e25863d0011767d574" },
    { name: "OLD wrapper_t", address: "0xFBC66A23Fe3dc851817eFDa6A039b599707E0E3b" },
  ];

  for (const factory of factories) {
    console.log(`Checking ${factory.name}...`);
    try {
      const factoryContract = await ethers.getContractAt("StandardFactory", factory.address);
      const filter = factoryContract.filters.NewDaoCreated();
      const events = await factoryContract.queryFilter(filter, fromBlock, currentBlock);

      console.log(`  Found ${events.length} DAO creation events`);

      for (const event of events) {
        if (event.args.daoAddress.toLowerCase() === daoAddress.toLowerCase()) {
          console.log(`\n*** FOUND! ***`);
          console.log(`DAO was created by: ${factory.name}`);
          console.log(`Factory address: ${factory.address}`);
          console.log(`Block: ${event.blockNumber}`);
          console.log(`Token: ${event.args.tokenAddress}`);
          console.log(`Creator: ${event.args.creator}`);
          return;
        }
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  console.log("\n*** DAO not found in last 1000 blocks ***");
  console.log("The DAO might be older. Check when it was created.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

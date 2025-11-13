const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0xb844cDF213be3140eF5aB45076Ec720A1e27fB40"; // IPCN token

  console.log("Checking how IPCN DAO was deployed...\n");

  // Get the creation transaction for this token
  // We'll need to find the DAO address first, then trace back to the factory call

  const provider = ethers.provider;

  // Get recent blocks and scan for the StandardFactory call
  const latestBlock = await provider.getBlockNumber();
  console.log(`Latest block: ${latestBlock}`);
  console.log("Scanning recent transactions to StandardFactory...\n");

  const factoryAddress = "0x0842AE3e3cc23F587ADe2198cD681b6AfFF234B4";

  // Scan last 100 blocks for transactions to the factory
  for (let i = latestBlock; i > latestBlock - 100; i--) {
    const block = await provider.getBlock(i, true);
    if (!block || !block.transactions) continue;

    for (const tx of block.transactions) {
      if (tx.to && tx.to.toLowerCase() === factoryAddress.toLowerCase()) {
        console.log(`\nFound transaction to StandardFactory:`);
        console.log(`  Block: ${i}`);
        console.log(`  Tx Hash: ${tx.hash}`);
        console.log(`  From: ${tx.from}`);

        // Get the function selector (first 4 bytes of data)
        const selector = tx.data.substring(0, 10);
        console.log(`  Function Selector: ${selector}`);

        // Compare with known selectors
        const stringSelector = "0x3c99ea13"; // deployDAOwithToken with string
        const boolSelector = "0x638a3f76";   // deployDAOwithToken with bool
        const structSelector = "0x16d08280"; // deployDAOwithToken with struct

        if (selector === stringSelector) {
          console.log(`  ✅ Called STRING version (correct!)`);
        } else if (selector === boolSelector) {
          console.log(`  ❌ Called BOOL version (bug!)`);
        } else if (selector === structSelector) {
          console.log(`  📦 Called STRUCT version`);
        } else {
          console.log(`  ❓ Unknown selector`);
        }

        console.log(`\nTransaction data (first 200 chars):`);
        console.log(tx.data.substring(0, 200) + "...");
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

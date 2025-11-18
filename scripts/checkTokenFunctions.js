const { ethers } = require("hardhat");

async function main() {
  const tokenAddress = "0x99BE22840b7bBd395970382F58f23bf11cA4a4A2";

  console.log("Checking token contract:", tokenAddress, "\n");

  const token = await ethers.getContractAt("RepToken", tokenAddress);

  // Check basic info
  const name = await token.name();
  const symbol = await token.symbol();
  const admin = await token.admin();
  const isTransferable = await token.isTransferable();

  console.log("Token info:");
  console.log("  Name:", name);
  console.log("  Symbol:", symbol);
  console.log("  Admin:", admin);
  console.log("  isTransferable:", isTransferable);

  // Check if mint function exists
  console.log("\nChecking for mint() function...");
  try {
    // Try to read the function selector
    const code = await ethers.provider.getCode(tokenAddress);
    const mintSelector = ethers.id("mint(address,uint256)").slice(0, 10);
    const burnSelector = ethers.id("burn(address,uint256)").slice(0, 10);

    console.log("  mint selector:", mintSelector);
    console.log("  burn selector:", burnSelector);

    if (code.includes(mintSelector.slice(2))) {
      console.log("  ✓ mint() function likely exists in bytecode");
    } else {
      console.log("  ✗ mint() function NOT found in bytecode");
    }

    if (code.includes(burnSelector.slice(2))) {
      console.log("  ✓ burn() function likely exists in bytecode");
    } else {
      console.log("  ✗ burn() function NOT found in bytecode");
    }

    // Try calling mint with staticCall (will fail but shows if function exists)
    console.log("\nTrying to call mint (will fail due to permissions, but shows if function exists)...");
    const [signer] = await ethers.getSigners();
    try {
      await token.mint.staticCall(signer.address, 1);
      console.log("  ✓ mint() function exists and is callable");
    } catch (e) {
      if (e.message.includes("Only admin can mint")) {
        console.log("  ✓ mint() function exists (failed with 'Only admin can mint')");
      } else {
        console.log("  ✗ Error:", e.message);
      }
    }
  } catch (e) {
    console.log("  ✗ Error checking mint:", e.message);
  }

  // Check which factory was used (look for NewDaoCreated event)
  console.log("\nLooking for DAO creation event...");
  const daoAddress = "0x4aC871347Fa3AA5e56ab1Fd0F4DD0b72d1FA65a8";

  // Check our new factories
  const newFactories = [
    { name: "StandardFactory", address: "0x4962e5cCBfE4258B9229bfff705cCacA4379f49f" },
    { name: "StandardFactoryWrapped", address: "0x39FF60f3dB4DD2054e5b6d5f8bE9782a45D0AbF2" }
  ];

  for (const factory of newFactories) {
    try {
      const factoryContract = await ethers.getContractAt("StandardFactory", factory.address);
      const filter = factoryContract.filters.NewDaoCreated(null, daoAddress);
      const events = await factoryContract.queryFilter(filter);

      if (events.length > 0) {
        console.log(`  ✓ DAO was created by ${factory.name} at ${factory.address}`);
        console.log(`    Block: ${events[0].blockNumber}`);
        return;
      }
    } catch (e) {
      // Factory doesn't have this DAO
    }
  }

  console.log("  ✗ DAO not found in new factories - must be from old factory");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

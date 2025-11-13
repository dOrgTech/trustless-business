const { ethers } = require("hardhat");

async function main() {
  const factoryAddress = "0x0842AE3e3cc23F587ADe2198cD681b6AfFF234B4";

  console.log("Checking deployed StandardFactory ABI...\n");
  console.log(`Factory Address: ${factoryAddress}\n`);

  // Get the deployed contract
  const factory = await ethers.getContractAt("StandardFactory", factoryAddress);

  // Get the interface to see all function signatures
  const iface = factory.interface;

  console.log("All deployDAOwithToken function variants:\n");

  // Find all deployDAOwithToken functions
  const allFunctions = iface.fragments.filter(f =>
    f.type === "function" && f.name === "deployDAOwithToken"
  );

  allFunctions.forEach((func, index) => {
    console.log(`${index + 1}. ${func.format("full")}`);
    console.log(`   Selector: ${iface.getFunction(func.name).selector}`);
    console.log("");
  });

  console.log("Expected selectors:");
  console.log("  String version: 0x3c99ea13");
  console.log("  Bool version: 0x638a3f76 (should NOT exist if fix worked)");
  console.log("  Struct version: 0x16d08280");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

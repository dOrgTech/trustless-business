const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0x11B14fD23557cE18c8faa89F7D2c21B1f951af2e";
  const tokenAddress = "0xEd12461863c7e168551eB48cda7c18D6682a74e2";
  const mintTo = "0x6E147e1D239bF49c88d64505e746e8522845D8D3";
  const mintAmount = "29000000000000000000";

  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);

  const targets = [tokenAddress];
  const values = [0];

  const iface = new ethers.Interface(["function mint(address to, uint256 amount)"]);
  const calldata = iface.encodeFunctionData("mint", [mintTo, mintAmount]);
  const calldatas = [calldata];

  // Try all possible descriptions
  const descriptions = [
    '0|||0Mint OMD0|||0tokens0|||0https://masdasd',
    'None0|||0Mint OMD0|||0tokens0|||0https://masdasd',
    'Mint OMD0|||0tokens0|||0https://masdasd',
    'tokens',
  ];

  console.log("Testing execution with different description hashes...\n");

  for (let i = 0; i < descriptions.length; i++) {
    const desc = descriptions[i];
    const descHash = ethers.id(desc);

    console.log(`Trying option ${i + 1}: "${desc}"`);
    console.log(`Hash: ${descHash}`);

    try {
      await dao.execute.staticCall(targets, values, calldatas, descHash);
      console.log("✅ SUCCESS! This is the correct description!\n");
      return;
    } catch (error) {
      console.log(`❌ Failed: ${error.shortMessage || error.message}\n`);
    }
  }

  console.log("None of the descriptions worked.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

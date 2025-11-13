const { ethers } = require("hardhat");

async function main() {
  console.log("Checking token transferability on Etherlink-Testnet...\n");

  const tokenAddresses = {
    "IPCN": "0xb844cDF213be3140eF5aB45076Ec720A1e27fB40"
  };

  // RepToken ABI snippet for the isTransferable function
  const repTokenABI = [
    "function isTransferable() view returns (bool)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)"
  ];

  for (const [name, address] of Object.entries(tokenAddresses)) {
    console.log(`\n${name} Token: ${address}`);
    console.log("=".repeat(60));

    try {
      const token = await ethers.getContractAt(repTokenABI, address);

      const tokenName = await token.name();
      const symbol = await token.symbol();
      const isTransferable = await token.isTransferable();

      console.log(`Name: ${tokenName}`);
      console.log(`Symbol: ${symbol}`);
      console.log(`isTransferable: ${isTransferable}`);

      if (isTransferable) {
        console.log("✅ Tokens CAN be transferred");
      } else {
        console.log("❌ Tokens CANNOT be transferred (non-transferable)");
      }

    } catch (error) {
      console.error(`Error checking ${name}:`, error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

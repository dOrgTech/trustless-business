const { ethers } = require("hardhat");

async function main() {
  const daoAddress = "0x4aC871347Fa3AA5e56ab1Fd0F4DD0b72d1FA65a8";
  const tokenAddress = "0x99BE22840b7bBd395970382F58f23bf11cA4a4A2";

  console.log("DAO:", daoAddress);
  console.log("Token:", tokenAddress, "\n");

  // Get the deployment block by binary searching
  const token = await ethers.getContractAt("RepToken", tokenAddress);
  
  // Get token deployment info
  const code = await ethers.provider.getCode(tokenAddress);
  console.log("Token bytecode length:", code.length);

  // Check constructor signature to see which factory was used
  const admin = await token.admin();
  const registryAddress = await token.registryAddress();
  const timelockAddress = await token.timelockAddress();

  console.log("\nToken constructor params:");
  console.log("  admin:", admin);
  console.log("  registryAddress:", registryAddress);
  console.log("  timelockAddress:", timelockAddress);

  // Get DAO info
  const dao = await ethers.getContractAt("HomebaseDAO", daoAddress);
  const daoTimelock = await dao.timelock();

  console.log("\nDAO timelock:", daoTimelock);
  console.log("Token's timelockAddress:", timelockAddress);
  console.log("Match:", daoTimelock.toLowerCase() === timelockAddress.toLowerCase());

  // The key question: does the token have mint/burn?
  console.log("\nChecking if token has mint() function...");
  const [signer] = await ethers.getSigners();
  
  try {
    // This will fail but tell us if the function exists
    await token.mint.staticCall(signer.address, 1);
  } catch (e) {
    if (e.message.includes("mint is not a function") || e.message.includes("execution reverted") && !e.message.includes("Only admin")) {
      console.log("✗ Token does NOT have mint() function");
      console.log("✗ This token was deployed with OLD RepTokenFactory");
      console.log("\n*** ROOT CAUSE ***");
      console.log("The web app is still using an OLD factory address that doesn't have mint/burn.");
      console.log("Even though Firestore was updated, the web app might:");
      console.log("1. Have cached the old address");
      console.log("2. Not be reading from Firestore");
      console.log("3. Be hardcoded with the old address");
    } else if (e.message.includes("Only admin")) {
      console.log("✓ Token HAS mint() function (failed with permission error)");
    } else {
      console.log("Error:", e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

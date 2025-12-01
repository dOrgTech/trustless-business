const hre = require("hardhat");

async function main() {
  console.log("Deploying TestNFTWithImage...");
  const Contract = await hre.ethers.getContractFactory("TestNFTWithImage");
  const contract = await Contract.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("TestNFTWithImage deployed to:", address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

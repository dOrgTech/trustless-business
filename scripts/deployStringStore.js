const hre = require("hardhat");

async function main() {
  console.log("Deploying TestStringStore...");
  const Contract = await hre.ethers.getContractFactory("TestStringStore");
  const contract = await Contract.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("TestStringStore deployed to:", address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

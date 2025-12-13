const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const newOwnerAddress = process.env.NEW_OWNER || "0x06E5b15Bc39f921e1503073dBb8A5dA2Fc6220E9";

  if (!newOwnerAddress) {
    console.log("Usage: NEW_OWNER=0x... npx hardhat run scripts/transferOwnership.js --network localhost");
    process.exit(1);
  }

  console.log(`Transferring ownership to: ${newOwnerAddress}\n`);

  // Read deployment info
  const deploymentPath = path.join(__dirname, "../deployments/localhost-all.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const [deployer] = await ethers.getSigners();
  console.log(`Current owner (deployer): ${deployer.address}`);

  // Transfer ownership of TrustlessFactory
  const TrustlessFactory = await ethers.getContractFactory("TrustlessFactory");
  const trustlessFactory = TrustlessFactory.attach(deployment.wrappers.wrapper_trustless);

  const currentOwner = await trustlessFactory.owner();
  console.log(`TrustlessFactory current owner: ${currentOwner}`);

  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("ERROR: Deployer is not the current owner!");
    process.exit(1);
  }

  console.log("\nTransferring TrustlessFactory ownership...");
  const tx = await trustlessFactory.transferOwnership(newOwnerAddress);
  await tx.wait();
  console.log(`TrustlessFactory ownership transferred to: ${newOwnerAddress}`);

  // Also transfer ownership of StandardFactories if needed
  const StandardFactoryNonTransferable = await ethers.getContractFactory("StandardFactoryNonTransferable");
  const nonTransferableFactory = StandardFactoryNonTransferable.attach(deployment.wrappers.wrapper);

  console.log("\nTransferring StandardFactoryNonTransferable ownership...");
  const tx2 = await nonTransferableFactory.transferOwnership(newOwnerAddress);
  await tx2.wait();
  console.log(`StandardFactoryNonTransferable ownership transferred to: ${newOwnerAddress}`);

  const StandardFactoryTransferable = await ethers.getContractFactory("StandardFactoryTransferable");
  const transferableFactory = StandardFactoryTransferable.attach(deployment.wrappers.wrapper_t);

  console.log("\nTransferring StandardFactoryTransferable ownership...");
  const tx3 = await transferableFactory.transferOwnership(newOwnerAddress);
  await tx3.wait();
  console.log(`StandardFactoryTransferable ownership transferred to: ${newOwnerAddress}`);

  console.log("\n✅ All factory ownerships transferred successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

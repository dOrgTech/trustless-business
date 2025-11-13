const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying BOTH StandardFactory variants to Etherlink Testnet...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} ETH\n`);

  // Deploy infrastructure factories (shared by both)
  console.log("1. Deploying InfrastructureFactory...");
  const InfrastructureFactory = await ethers.getContractFactory("InfrastructureFactory");
  const infrastructureFactory = await InfrastructureFactory.deploy();
  await infrastructureFactory.waitForDeployment();
  const infrastructureAddr = await infrastructureFactory.getAddress();
  console.log(`   InfrastructureFactory deployed at: ${infrastructureAddr}`);

  console.log("2. Deploying DAOFactory...");
  const DAOFactory = await ethers.getContractFactory("DAOFactory");
  const daoFactory = await DAOFactory.deploy();
  await daoFactory.waitForDeployment();
  const daoFactoryAddr = await daoFactory.getAddress();
  console.log(`   DAOFactory deployed at: ${daoFactoryAddr}`);

  console.log("3. Deploying RepTokenFactory...");
  const RepTokenFactory = await ethers.getContractFactory("RepTokenFactory");
  const repTokenFactory = await RepTokenFactory.deploy();
  await repTokenFactory.waitForDeployment();
  const repTokenFactoryAddr = await repTokenFactory.getAddress();
  console.log(`   RepTokenFactory deployed at: ${repTokenFactoryAddr}`);

  // Deploy NON-TRANSFERABLE wrapper
  console.log("4. Deploying StandardFactoryNonTransferable...");
  const StandardFactoryNonTransferable = await ethers.getContractFactory("StandardFactoryNonTransferable");
  const nonTransferableFactory = await StandardFactoryNonTransferable.deploy(
    infrastructureAddr,
    daoFactoryAddr,
    repTokenFactoryAddr
  );
  await nonTransferableFactory.waitForDeployment();
  const nonTransferableAddr = await nonTransferableFactory.getAddress();
  console.log(`   StandardFactoryNonTransferable deployed at: ${nonTransferableAddr}`);

  // Deploy TRANSFERABLE wrapper
  console.log("5. Deploying StandardFactoryTransferable...");
  const StandardFactoryTransferable = await ethers.getContractFactory("StandardFactoryTransferable");
  const transferableFactory = await StandardFactoryTransferable.deploy(
    infrastructureAddr,
    daoFactoryAddr,
    repTokenFactoryAddr
  );
  await transferableFactory.waitForDeployment();
  const transferableAddr = await transferableFactory.getAddress();
  console.log(`   StandardFactoryTransferable deployed at: ${transferableAddr}`);

  console.log("\nDeployment complete!");

  // Save deployment info
  const deploymentInfo = {
    network: "Etherlink-Testnet",
    chainId: 128123,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      infrastructureFactory: infrastructureAddr,
      daoFactory: daoFactoryAddr,
      repTokenFactory: repTokenFactoryAddr,
      standardFactoryNonTransferable: nonTransferableAddr,
      standardFactoryTransferable: transferableAddr
    }
  };

  const deploymentPath = path.join(__dirname, "../deployments/etherlink-testnet-both-factories.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to: ${deploymentPath}`);

  console.log("\nSummary:");
  console.log("========================================");
  console.log("SHARED INFRASTRUCTURE:");
  console.log(`InfrastructureFactory:    ${infrastructureAddr}`);
  console.log(`DAOFactory:               ${daoFactoryAddr}`);
  console.log(`RepTokenFactory:          ${repTokenFactoryAddr}`);
  console.log("");
  console.log("WRAPPERS:");
  console.log(`NON-TRANSFERABLE tokens:  ${nonTransferableAddr}`);
  console.log(`TRANSFERABLE tokens:      ${transferableAddr}`);
  console.log("========================================");

  console.log("\nNext steps:");
  console.log("1. Update Firestore with BOTH wrapper addresses");
  console.log("2. Update web app to use the NON-TRANSFERABLE wrapper by default");
  console.log("3. Optionally expose TRANSFERABLE wrapper for special use cases");
  console.log("4. Restart indexer to monitor both wrappers");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

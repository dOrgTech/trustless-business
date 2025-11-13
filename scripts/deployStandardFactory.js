const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying StandardFactory and dependencies to Etherlink Testnet...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  // Step 1: Deploy InfrastructureFactory
  console.log("1. Deploying InfrastructureFactory...");
  const InfrastructureFactory = await ethers.getContractFactory("InfrastructureFactory");
  const infrastructureFactory = await InfrastructureFactory.deploy();
  await infrastructureFactory.waitForDeployment();
  const infraAddr = await infrastructureFactory.getAddress();
  console.log("   InfrastructureFactory deployed at:", infraAddr);

  // Step 2: Deploy DAOFactory
  console.log("2. Deploying DAOFactory...");
  const DAOFactory = await ethers.getContractFactory("DAOFactory");
  const daoFactory = await DAOFactory.deploy();
  await daoFactory.waitForDeployment();
  const daoFactoryAddr = await daoFactory.getAddress();
  console.log("   DAOFactory deployed at:", daoFactoryAddr);

  // Step 3: Deploy RepTokenFactory
  console.log("3. Deploying RepTokenFactory...");
  const RepTokenFactory = await ethers.getContractFactory("RepTokenFactory");
  const repTokenFactory = await RepTokenFactory.deploy();
  await repTokenFactory.waitForDeployment();
  const repTokenFactoryAddr = await repTokenFactory.getAddress();
  console.log("   RepTokenFactory deployed at:", repTokenFactoryAddr);

  // Step 4: Deploy StandardFactory (the wrapper contract)
  console.log("4. Deploying StandardFactory (wrapper contract)...");
  const StandardFactory = await ethers.getContractFactory("StandardFactory");
  const standardFactory = await StandardFactory.deploy(
    infraAddr,
    daoFactoryAddr,
    repTokenFactoryAddr
  );
  await standardFactory.waitForDeployment();
  const standardFactoryAddr = await standardFactory.getAddress();
  console.log("   StandardFactory deployed at:", standardFactoryAddr);

  // Save deployment addresses
  const deploymentInfo = {
    network: "Etherlink-Testnet",
    chainId: 128123,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      infrastructureFactory: infraAddr,
      daoFactory: daoFactoryAddr,
      repTokenFactory: repTokenFactoryAddr,
      standardFactory: standardFactoryAddr
    }
  };

  const outputPath = path.join(__dirname, "..", "deployments", "etherlink-testnet-standard.json");
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\nDeployment complete!");
  console.log("\nDeployment info saved to:", outputPath);
  console.log("\nSummary:");
  console.log("========================================");
  console.log("StandardFactory (wrapper):", standardFactoryAddr);
  console.log("InfrastructureFactory:   ", infraAddr);
  console.log("DAOFactory:              ", daoFactoryAddr);
  console.log("RepTokenFactory:         ", repTokenFactoryAddr);
  console.log("========================================");
  console.log("\nNext steps:");
  console.log("1. Update Firestore with wrapper address:", standardFactoryAddr);
  console.log("2. Update indexer configuration to monitor this wrapper");
  console.log("3. Test DAO deployment through the StandardFactory");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

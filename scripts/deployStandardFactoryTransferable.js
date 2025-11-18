const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying StandardFactoryTransferable to Etherlink Testnet...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  // Check if we can reuse existing factories from StandardFactory deployment
  const existingDeploymentPath = path.join(__dirname, "..", "deployments", "etherlink-testnet-standard.json");
  let infraAddr, daoFactoryAddr, repTokenFactoryAddr;

  if (fs.existsSync(existingDeploymentPath)) {
    console.log("Found existing deployment file. Checking for reusable factories...");
    const existingDeployment = JSON.parse(fs.readFileSync(existingDeploymentPath, "utf8"));
    infraAddr = existingDeployment.contracts?.infrastructureFactory;
    daoFactoryAddr = existingDeployment.contracts?.daoFactory;
    repTokenFactoryAddr = existingDeployment.contracts?.repTokenFactory;

    if (infraAddr && daoFactoryAddr && repTokenFactoryAddr) {
      console.log("Reusing existing factories:");
      console.log("   InfrastructureFactory:", infraAddr);
      console.log("   DAOFactory:", daoFactoryAddr);
      console.log("   RepTokenFactory:", repTokenFactoryAddr);
      console.log();
    }
  }

  // Deploy missing factories if needed
  if (!infraAddr) {
    console.log("1. Deploying InfrastructureFactory...");
    const InfrastructureFactory = await ethers.getContractFactory("InfrastructureFactory");
    const infrastructureFactory = await InfrastructureFactory.deploy();
    await infrastructureFactory.waitForDeployment();
    infraAddr = await infrastructureFactory.getAddress();
    console.log("   InfrastructureFactory deployed at:", infraAddr);
  }

  if (!daoFactoryAddr) {
    console.log("2. Deploying DAOFactory...");
    const DAOFactory = await ethers.getContractFactory("DAOFactory");
    const daoFactory = await DAOFactory.deploy();
    await daoFactory.waitForDeployment();
    daoFactoryAddr = await daoFactory.getAddress();
    console.log("   DAOFactory deployed at:", daoFactoryAddr);
  }

  if (!repTokenFactoryAddr) {
    console.log("3. Deploying RepTokenFactory...");
    const RepTokenFactory = await ethers.getContractFactory("RepTokenFactory");
    const repTokenFactory = await RepTokenFactory.deploy();
    await repTokenFactory.waitForDeployment();
    repTokenFactoryAddr = await repTokenFactory.getAddress();
    console.log("   RepTokenFactory deployed at:", repTokenFactoryAddr);
  }

  // Deploy StandardFactoryTransferable
  console.log("4. Deploying StandardFactoryTransferable (wrapper_t contract)...");
  const StandardFactoryTransferable = await ethers.getContractFactory("StandardFactoryTransferable");
  const standardFactoryTransferable = await StandardFactoryTransferable.deploy(
    infraAddr,
    daoFactoryAddr,
    repTokenFactoryAddr
  );
  await standardFactoryTransferable.waitForDeployment();
  const standardFactoryTransferableAddr = await standardFactoryTransferable.getAddress();
  console.log("   StandardFactoryTransferable deployed at:", standardFactoryTransferableAddr);

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
      standardFactoryTransferable: standardFactoryTransferableAddr
    }
  };

  const outputPath = path.join(__dirname, "..", "deployments", "etherlink-testnet-transferable.json");
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\nDeployment complete!");
  console.log("\nDeployment info saved to:", outputPath);
  console.log("\nSummary:");
  console.log("========================================");
  console.log("StandardFactoryTransferable (wrapper_t):", standardFactoryTransferableAddr);
  console.log("InfrastructureFactory:                 ", infraAddr);
  console.log("DAOFactory:                            ", daoFactoryAddr);
  console.log("RepTokenFactory:                       ", repTokenFactoryAddr);
  console.log("========================================");
  console.log("\nNext steps:");
  console.log("1. Update Firestore with wrapper_t address:", standardFactoryTransferableAddr);
  console.log("2. Test transferable DAO deployment through the StandardFactoryTransferable");
  console.log("\nFirestore update command:");
  console.log(`   Field: wrapper_t`);
  console.log(`   Value: ${standardFactoryTransferableAddr}`);
  console.log(`   Location: contracts/Etherlink-Testnet`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

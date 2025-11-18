const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying StandardFactoryWrapped and dependencies to Etherlink Testnet...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  // Check if we can reuse existing factories
  const existingDeploymentPath = path.join(__dirname, "..", "deployments", "etherlink-testnet-standard.json");
  let infraAddr, daoFactoryAddr;

  if (fs.existsSync(existingDeploymentPath)) {
    console.log("Found existing deployment file. Checking for reusable factories...");
    const existingDeployment = JSON.parse(fs.readFileSync(existingDeploymentPath, "utf8"));
    infraAddr = existingDeployment.contracts?.infrastructureFactory;
    daoFactoryAddr = existingDeployment.contracts?.daoFactory;

    if (infraAddr && daoFactoryAddr) {
      console.log("Reusing existing factories:");
      console.log("   InfrastructureFactory:", infraAddr);
      console.log("   DAOFactory:", daoFactoryAddr);
      console.log();
    }
  }

  // Deploy InfrastructureFactory if not reusing
  if (!infraAddr) {
    console.log("1. Deploying InfrastructureFactory...");
    const InfrastructureFactory = await ethers.getContractFactory("InfrastructureFactory");
    const infrastructureFactory = await InfrastructureFactory.deploy();
    await infrastructureFactory.waitForDeployment();
    infraAddr = await infrastructureFactory.getAddress();
    console.log("   InfrastructureFactory deployed at:", infraAddr);
  }

  // Deploy DAOFactory if not reusing
  if (!daoFactoryAddr) {
    console.log("2. Deploying DAOFactory...");
    const DAOFactory = await ethers.getContractFactory("DAOFactory");
    const daoFactory = await DAOFactory.deploy();
    await daoFactory.waitForDeployment();
    daoFactoryAddr = await daoFactory.getAddress();
    console.log("   DAOFactory deployed at:", daoFactoryAddr);
  }

  // Step 3: Deploy WrappedRepTokenFactory
  console.log("3. Deploying WrappedRepTokenFactory...");
  const WrappedRepTokenFactory = await ethers.getContractFactory("WrappedRepTokenFactory");
  const wrappedRepTokenFactory = await WrappedRepTokenFactory.deploy();
  await wrappedRepTokenFactory.waitForDeployment();
  const wrappedRepTokenFactoryAddr = await wrappedRepTokenFactory.getAddress();
  console.log("   WrappedRepTokenFactory deployed at:", wrappedRepTokenFactoryAddr);

  // Step 4: Deploy StandardFactoryWrapped (the wrapper contract)
  console.log("4. Deploying StandardFactoryWrapped (wrapper_w contract)...");
  const StandardFactoryWrapped = await ethers.getContractFactory("StandardFactoryWrapped");
  const standardFactoryWrapped = await StandardFactoryWrapped.deploy(
    infraAddr,
    daoFactoryAddr,
    wrappedRepTokenFactoryAddr
  );
  await standardFactoryWrapped.waitForDeployment();
  const standardFactoryWrappedAddr = await standardFactoryWrapped.getAddress();
  console.log("   StandardFactoryWrapped deployed at:", standardFactoryWrappedAddr);

  // Save deployment addresses
  const deploymentInfo = {
    network: "Etherlink-Testnet",
    chainId: 128123,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      infrastructureFactory: infraAddr,
      daoFactory: daoFactoryAddr,
      wrappedRepTokenFactory: wrappedRepTokenFactoryAddr,
      standardFactoryWrapped: standardFactoryWrappedAddr
    }
  };

  const outputPath = path.join(__dirname, "..", "deployments", "etherlink-testnet-wrapped.json");
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\nDeployment complete!");
  console.log("\nDeployment info saved to:", outputPath);
  console.log("\nSummary:");
  console.log("========================================");
  console.log("StandardFactoryWrapped (wrapper_w):", standardFactoryWrappedAddr);
  console.log("InfrastructureFactory:            ", infraAddr);
  console.log("DAOFactory:                       ", daoFactoryAddr);
  console.log("WrappedRepTokenFactory:           ", wrappedRepTokenFactoryAddr);
  console.log("========================================");
  console.log("\nNext steps:");
  console.log("1. Update Firestore with wrapper_w address:", standardFactoryWrappedAddr);
  console.log("2. Update indexer configuration to monitor this wrapper");
  console.log("3. Test wrapped DAO deployment through the StandardFactoryWrapped");
  console.log("\nFirestore update command:");
  console.log(`   Field: wrapper_w`);
  console.log(`   Value: ${standardFactoryWrappedAddr}`);
  console.log(`   Location: contracts/Etherlink-Testnet`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

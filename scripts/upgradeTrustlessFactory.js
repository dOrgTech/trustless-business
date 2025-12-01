const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Existing deployments to reuse
const EXISTING = {
  infrastructureFactory: "0xFD4FcC7e5330938d378a89952e26c988854a7a7F",
  daoFactory: "0xB6100851F0C84E89b17b6972310A87f809848e35",
  repTokenFactory: "0xab683405fEA6486f6DF395e97B575868918a3B9B",
  // Project implementations (unchanged)
  nativeProject: "0xBf37dCFb407f1f866963453F46E137014c211a8F",
  erc20Project: "0x375CB58c1B7f86C270Dd458De08DD4DDc7435b7f"
};

async function main() {
  console.log("Upgrading TrustlessFactory (Economy contract change only)...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  console.log("Reusing existing contracts:");
  console.log("  InfrastructureFactory:", EXISTING.infrastructureFactory);
  console.log("  DAOFactory:           ", EXISTING.daoFactory);
  console.log("  RepTokenFactory:      ", EXISTING.repTokenFactory);
  console.log("");

  // Step 1: Deploy new EconomyFactory (contains updated Economy bytecode)
  console.log("1. Deploying new EconomyFactory (with getConfig() support)...");
  const EconomyFactory = await ethers.getContractFactory("EconomyFactory");
  const economyFactory = await EconomyFactory.deploy();
  await economyFactory.waitForDeployment();
  const economyFactoryAddr = await economyFactory.getAddress();
  console.log("   EconomyFactory deployed at:", economyFactoryAddr);

  // Step 2: Deploy new TrustlessFactory with new EconomyFactory
  console.log("2. Deploying new TrustlessFactory...");
  const TrustlessFactory = await ethers.getContractFactory("TrustlessFactory");
  const trustlessFactory = await TrustlessFactory.deploy(
    EXISTING.infrastructureFactory,
    EXISTING.daoFactory,
    economyFactoryAddr,
    EXISTING.repTokenFactory
  );
  await trustlessFactory.waitForDeployment();
  const trustlessFactoryAddr = await trustlessFactory.getAddress();
  console.log("   TrustlessFactory deployed at:", trustlessFactoryAddr);

  // Save deployment addresses
  const deploymentInfo = {
    network: "Etherlink-Testnet",
    chainId: 128123,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    projectImplementations: {
      nativeProject: EXISTING.nativeProject,
      erc20Project: EXISTING.erc20Project
    },
    contracts: {
      infrastructureFactory: EXISTING.infrastructureFactory,
      daoFactory: EXISTING.daoFactory,
      economyFactory: economyFactoryAddr,
      repTokenFactory: EXISTING.repTokenFactory,
      trustlessFactory: trustlessFactoryAddr
    }
  };

  const outputPath = path.join(__dirname, "..", "deployments", "etherlink-testnet-trustless.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\nUpgrade complete!");
  console.log("\nDeployment info saved to:", outputPath);
  console.log("\nSummary:");
  console.log("========================================");
  console.log("NEW TrustlessFactory (wrapper):", trustlessFactoryAddr);
  console.log("NEW EconomyFactory:            ", economyFactoryAddr);
  console.log("========================================");
  console.log("\nNext steps:");
  console.log("1. Update Firestore 'contracts/Etherlink-Testnet' doc:");
  console.log("   wrapper_trustless:", trustlessFactoryAddr);
  console.log("2. Test economy DAO creation and verify getConfig() works");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

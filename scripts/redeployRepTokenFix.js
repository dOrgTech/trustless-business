const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Redeploys contracts affected by the RepToken parity calculation fix:
 * - RepTokenFactory (because it creates RepToken with new bytecode)
 * - TrustlessFactory (because it references RepTokenFactory)
 *
 * REUSES existing unchanged contracts:
 * - InfrastructureFactory
 * - DAOFactory
 * - EconomyFactory
 * - NativeProject/ERC20Project implementations
 */

async function main() {
  console.log("Redeploying RepToken-related contracts to Etherlink Testnet...\n");
  console.log("This script fixes the parity calculation bug in RepToken._calculateReputation()\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  // Load existing deployment info
  const existingDeploymentPath = path.join(__dirname, "..", "deployments", "etherlink-testnet-economy-redeploy.json");
  let existingDeployment = {};
  if (fs.existsSync(existingDeploymentPath)) {
    existingDeployment = JSON.parse(fs.readFileSync(existingDeploymentPath, "utf8"));
    console.log("Loaded existing deployment info from:", existingDeploymentPath);
  }

  // Existing factory addresses (unchanged - DO NOT REDEPLOY)
  const EXISTING_INFRA_FACTORY = existingDeployment.reusedContracts?.infrastructureFactory || "0xaAee6c3C383D8f85920977375561fcb7CdA5543b";
  const EXISTING_DAO_FACTORY = existingDeployment.reusedContracts?.daoFactory || "0x72C0413227418e4C1bbA40559c762c15A1417db7";
  const EXISTING_ECONOMY_FACTORY = existingDeployment.newContracts?.economyFactory || "0xB0015138a67dc50565ff278dc6Ee194F0f8d3543";

  // Project implementations (unchanged)
  const EXISTING_NATIVE_PROJECT = existingDeployment.projectImplementations?.nativeProject || "0x0F335Bf548D1C7aF30a5e5830146ab89dfCe7005";
  const EXISTING_ERC20_PROJECT = existingDeployment.projectImplementations?.erc20Project || "0x83138994Df6d52c1A2135d5514d4C868c86f6639";

  console.log("Reusing existing unchanged contracts:");
  console.log("  InfrastructureFactory:", EXISTING_INFRA_FACTORY);
  console.log("  DAOFactory:           ", EXISTING_DAO_FACTORY);
  console.log("  EconomyFactory:       ", EXISTING_ECONOMY_FACTORY);
  console.log("  NativeProject impl:   ", EXISTING_NATIVE_PROJECT);
  console.log("  ERC20Project impl:    ", EXISTING_ERC20_PROJECT);
  console.log("");

  // Step 1: Deploy NEW RepTokenFactory
  console.log("1. Deploying NEW RepTokenFactory (RepToken bytecode changed)...");
  const RepTokenFactory = await ethers.getContractFactory("RepTokenFactory");
  const repTokenFactory = await RepTokenFactory.deploy();
  await repTokenFactory.waitForDeployment();
  const repTokenFactoryAddr = await repTokenFactory.getAddress();
  console.log("   RepTokenFactory deployed at:", repTokenFactoryAddr);

  // Step 2: Deploy NEW TrustlessFactory
  console.log("2. Deploying NEW TrustlessFactory (references new RepTokenFactory)...");
  const TrustlessFactory = await ethers.getContractFactory("TrustlessFactory");
  const trustlessFactory = await TrustlessFactory.deploy(
    EXISTING_INFRA_FACTORY,
    EXISTING_DAO_FACTORY,
    EXISTING_ECONOMY_FACTORY,
    repTokenFactoryAddr  // NEW RepTokenFactory
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
    description: "RepToken parity calculation fix - divide by 1e18",
    fix: "RepToken._calculateReputation now returns (amount * parity) / 1e18 instead of amount * parity",
    projectImplementations: {
      nativeProject: EXISTING_NATIVE_PROJECT,
      erc20Project: EXISTING_ERC20_PROJECT
    },
    newContracts: {
      repTokenFactory: repTokenFactoryAddr,
      trustlessFactory: trustlessFactoryAddr
    },
    reusedContracts: {
      infrastructureFactory: EXISTING_INFRA_FACTORY,
      daoFactory: EXISTING_DAO_FACTORY,
      economyFactory: EXISTING_ECONOMY_FACTORY
    }
  };

  const outputPath = path.join(__dirname, "..", "deployments", "etherlink-testnet-reptoken-fix.json");
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\nDeployment complete!");
  console.log("\nDeployment info saved to:", outputPath);
  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log("NEW TrustlessFactory (wrapper):", trustlessFactoryAddr);
  console.log("NEW RepTokenFactory:           ", repTokenFactoryAddr);
  console.log("========================================");
  console.log("\nFirestore update required:");
  console.log("  Collection: contracts/Etherlink-Testnet");
  console.log("  Field: wrapperTrustless");
  console.log("  Value:", trustlessFactoryAddr);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

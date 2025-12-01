const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Redeploys ONLY the Economy-related contracts that changed:
 * - NativeProject (implementation) - new arbitration fee model
 * - ERC20Project (implementation) - new arbitration fee model
 * - EconomyFactory - new deployEconomy() signature with arbitrationFeeBps
 * - TrustlessFactory - new deployInfrastructure() signature and EconomyParams struct
 *
 * REUSES existing unchanged contracts:
 * - InfrastructureFactory
 * - DAOFactory
 * - RepTokenFactory
 */

async function main() {
  console.log("Redeploying Economy-related contracts to Etherlink Testnet...\n");
  console.log("This script redeploys ONLY contracts affected by the arbitration fee changes.\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  // Existing factory addresses (unchanged - DO NOT REDEPLOY)
  const EXISTING_INFRA_FACTORY = "0xaAee6c3C383D8f85920977375561fcb7CdA5543b";
  const EXISTING_DAO_FACTORY = "0x72C0413227418e4C1bbA40559c762c15A1417db7";
  const EXISTING_REP_TOKEN_FACTORY = "0x440a296CF621F704ac25F5F27FB3d043F7B95F05";

  console.log("Reusing existing unchanged factories:");
  console.log("  InfrastructureFactory:", EXISTING_INFRA_FACTORY);
  console.log("  DAOFactory:           ", EXISTING_DAO_FACTORY);
  console.log("  RepTokenFactory:      ", EXISTING_REP_TOKEN_FACTORY);
  console.log("");

  // Step 1: Deploy NEW project implementations
  console.log("1. Deploying NEW project implementations (arbitration fee changes)...");
  const NativeProject = await ethers.getContractFactory("NativeProject");
  const nativeProject = await NativeProject.deploy();
  await nativeProject.waitForDeployment();
  const nativeAddr = await nativeProject.getAddress();
  console.log("   NativeProject deployed at:", nativeAddr);

  const ERC20Project = await ethers.getContractFactory("ERC20Project");
  const erc20Project = await ERC20Project.deploy();
  await erc20Project.waitForDeployment();
  const erc20Addr = await erc20Project.getAddress();
  console.log("   ERC20Project deployed at:", erc20Addr);

  // Step 2: Deploy NEW EconomyFactory
  console.log("2. Deploying NEW EconomyFactory (deployEconomy now takes arbitrationFeeBps)...");
  const EconomyFactory = await ethers.getContractFactory("EconomyFactory");
  const economyFactory = await EconomyFactory.deploy();
  await economyFactory.waitForDeployment();
  const economyFactoryAddr = await economyFactory.getAddress();
  console.log("   EconomyFactory deployed at:", economyFactoryAddr);

  // Step 3: Deploy NEW TrustlessFactory (wrapper contract)
  console.log("3. Deploying NEW TrustlessFactory (updated EconomyParams struct)...");
  const TrustlessFactory = await ethers.getContractFactory("TrustlessFactory");
  const trustlessFactory = await TrustlessFactory.deploy(
    EXISTING_INFRA_FACTORY,
    EXISTING_DAO_FACTORY,
    economyFactoryAddr,  // NEW
    EXISTING_REP_TOKEN_FACTORY
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
    description: "Economy contracts redeployment - unified percentage-based arbitration fee",
    changes: [
      "arbitrationFeeBps now passed to Economy constructor",
      "Contractor-only stake model (author no longer stakes)",
      "Fee calculated at signing time based on projectValue",
      "reclaimArbitrationFee() renamed to reclaimArbitrationStake()"
    ],
    projectImplementations: {
      nativeProject: nativeAddr,
      erc20Project: erc20Addr
    },
    newContracts: {
      economyFactory: economyFactoryAddr,
      trustlessFactory: trustlessFactoryAddr
    },
    reusedContracts: {
      infrastructureFactory: EXISTING_INFRA_FACTORY,
      daoFactory: EXISTING_DAO_FACTORY,
      repTokenFactory: EXISTING_REP_TOKEN_FACTORY
    }
  };

  const outputPath = path.join(__dirname, "..", "deployments", "etherlink-testnet-economy-redeploy.json");
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\nDeployment complete!");
  console.log("\nDeployment info saved to:", outputPath);
  console.log("\nSummary:");
  console.log("========================================");
  console.log("NEW TrustlessFactory (wrapper):", trustlessFactoryAddr);
  console.log("----------------------------------------");
  console.log("NEW Project Implementations:");
  console.log("  NativeProject:         ", nativeAddr);
  console.log("  ERC20Project:          ", erc20Addr);
  console.log("----------------------------------------");
  console.log("NEW Factories:");
  console.log("  EconomyFactory:        ", economyFactoryAddr);
  console.log("----------------------------------------");
  console.log("REUSED (unchanged) Factories:");
  console.log("  InfrastructureFactory: ", EXISTING_INFRA_FACTORY);
  console.log("  DAOFactory:            ", EXISTING_DAO_FACTORY);
  console.log("  RepTokenFactory:       ", EXISTING_REP_TOKEN_FACTORY);
  console.log("========================================");
  console.log("\nNext steps:");
  console.log("1. Update Firestore 'contracts/Etherlink-Testnet' with:");
  console.log("   - wrapper_trustless:", trustlessFactoryAddr);
  console.log("2. Update DAO_DEPLOYMENT_GUIDE.md with new addresses");
  console.log("3. Test Economy DAO deployment with arbitrationFeeBps parameter");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

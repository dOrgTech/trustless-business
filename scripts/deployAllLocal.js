const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying FULL DAO + Economy contract suite to localhost...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} ETH\n`);

  // ============================================
  // Step 1: Deploy project implementations
  // ============================================
  console.log("1. Deploying project implementations...");

  const NativeProject = await ethers.getContractFactory("NativeProject");
  const nativeProject = await NativeProject.deploy();
  await nativeProject.waitForDeployment();
  const nativeProjectAddr = await nativeProject.getAddress();
  console.log(`   NativeProject deployed at: ${nativeProjectAddr}`);

  const ERC20Project = await ethers.getContractFactory("ERC20Project");
  const erc20Project = await ERC20Project.deploy();
  await erc20Project.waitForDeployment();
  const erc20ProjectAddr = await erc20Project.getAddress();
  console.log(`   ERC20Project deployed at: ${erc20ProjectAddr}`);

  // ============================================
  // Step 2: Deploy core factories (shared)
  // ============================================
  console.log("\n2. Deploying core factories...");

  const InfrastructureFactory = await ethers.getContractFactory("InfrastructureFactory");
  const infrastructureFactory = await InfrastructureFactory.deploy();
  await infrastructureFactory.waitForDeployment();
  const infraAddr = await infrastructureFactory.getAddress();
  console.log(`   InfrastructureFactory deployed at: ${infraAddr}`);

  const DAOFactory = await ethers.getContractFactory("DAOFactory");
  const daoFactory = await DAOFactory.deploy();
  await daoFactory.waitForDeployment();
  const daoFactoryAddr = await daoFactory.getAddress();
  console.log(`   DAOFactory deployed at: ${daoFactoryAddr}`);

  const RepTokenFactory = await ethers.getContractFactory("RepTokenFactory");
  const repTokenFactory = await RepTokenFactory.deploy();
  await repTokenFactory.waitForDeployment();
  const repTokenFactoryAddr = await repTokenFactory.getAddress();
  console.log(`   RepTokenFactory deployed at: ${repTokenFactoryAddr}`);

  const EconomyFactory = await ethers.getContractFactory("EconomyFactory");
  const economyFactory = await EconomyFactory.deploy();
  await economyFactory.waitForDeployment();
  const economyFactoryAddr = await economyFactory.getAddress();
  console.log(`   EconomyFactory deployed at: ${economyFactoryAddr}`);

  // ============================================
  // Step 3: Deploy Standard DAO wrappers
  // ============================================
  console.log("\n3. Deploying Standard DAO wrappers...");

  const StandardFactoryNonTransferable = await ethers.getContractFactory("StandardFactoryNonTransferable");
  const nonTransferableFactory = await StandardFactoryNonTransferable.deploy(
    infraAddr,
    daoFactoryAddr,
    repTokenFactoryAddr
  );
  await nonTransferableFactory.waitForDeployment();
  const wrapperAddr = await nonTransferableFactory.getAddress();
  console.log(`   StandardFactoryNonTransferable (wrapper) deployed at: ${wrapperAddr}`);

  const StandardFactoryTransferable = await ethers.getContractFactory("StandardFactoryTransferable");
  const transferableFactory = await StandardFactoryTransferable.deploy(
    infraAddr,
    daoFactoryAddr,
    repTokenFactoryAddr
  );
  await transferableFactory.waitForDeployment();
  const wrapperTAddr = await transferableFactory.getAddress();
  console.log(`   StandardFactoryTransferable (wrapper_t) deployed at: ${wrapperTAddr}`);

  // ============================================
  // Step 4: Deploy Trustless (Economy) wrapper
  // ============================================
  console.log("\n4. Deploying Trustless (Economy) wrapper...");

  const TrustlessFactory = await ethers.getContractFactory("TrustlessFactory");
  const trustlessFactory = await TrustlessFactory.deploy(
    infraAddr,
    daoFactoryAddr,
    economyFactoryAddr,
    repTokenFactoryAddr
  );
  await trustlessFactory.waitForDeployment();
  const wrapperTrustlessAddr = await trustlessFactory.getAddress();
  console.log(`   TrustlessFactory (wrapper_trustless) deployed at: ${wrapperTrustlessAddr}`);

  // ============================================
  // Summary and save deployment info
  // ============================================
  const deploymentInfo = {
    network: "Localhost",
    chainId: 31337,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    projectImplementations: {
      nativeProject: nativeProjectAddr,
      erc20Project: erc20ProjectAddr
    },
    factories: {
      infrastructureFactory: infraAddr,
      daoFactory: daoFactoryAddr,
      repTokenFactory: repTokenFactoryAddr,
      economyFactory: economyFactoryAddr
    },
    wrappers: {
      wrapper: wrapperAddr,           // StandardFactoryNonTransferable
      wrapper_t: wrapperTAddr,        // StandardFactoryTransferable
      wrapper_trustless: wrapperTrustlessAddr  // TrustlessFactory (Economy DAO)
    }
  };

  // Save to file
  const outputPath = path.join(__dirname, "..", "deployments", "localhost-all.json");
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n========================================");
  console.log("LOCAL DEPLOYMENT COMPLETE!");
  console.log("========================================");
  console.log("\nProject Implementations:");
  console.log(`  NativeProject:              ${nativeProjectAddr}`);
  console.log(`  ERC20Project:               ${erc20ProjectAddr}`);
  console.log("\nCore Factories:");
  console.log(`  InfrastructureFactory:      ${infraAddr}`);
  console.log(`  DAOFactory:                 ${daoFactoryAddr}`);
  console.log(`  RepTokenFactory:            ${repTokenFactoryAddr}`);
  console.log(`  EconomyFactory:             ${economyFactoryAddr}`);
  console.log("\nWrapper Contracts (for frontend):");
  console.log(`  wrapper (non-transferable): ${wrapperAddr}`);
  console.log(`  wrapper_t (transferable):   ${wrapperTAddr}`);
  console.log(`  wrapper_trustless (economy):${wrapperTrustlessAddr}`);
  console.log("========================================");
  console.log(`\nDeployment info saved to: ${outputPath}`);

  // Output Firestore document format
  console.log("\n========================================");
  console.log("FIRESTORE DOCUMENT (contracts/Localhost):");
  console.log("========================================");
  const firestoreDoc = {
    rpc: "http://127.0.0.1:8545",
    chainId: 31337,
    daoFactory: daoFactoryAddr,
    wrapper: wrapperAddr,
    wrapper_t: wrapperTAddr,
    wrapper_w: wrapperAddr,  // Use non-transferable as fallback for wrapped ERC20
    wrapper_trustless: wrapperTrustlessAddr,
    nativeProjectImpl: nativeProjectAddr,
    erc20ProjectImpl: erc20ProjectAddr,
    nativeCurrency: "ETH",
    symbol: "ETH",
    blockExplorer: ""
  };
  console.log(JSON.stringify(firestoreDoc, null, 2));
  console.log("========================================");

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

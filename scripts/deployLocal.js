const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying Economy + Project contracts to local Hardhat node...\n");

  const [deployer, author, contractor, arbiter, backer1, backer2] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Author:", author.address);
  console.log("Contractor:", contractor.address);
  console.log("Arbiter:", arbiter.address);
  console.log("Backer1:", backer1.address);
  console.log("Backer2:", backer2.address);
  console.log();

  // Deploy MockRepToken for project threshold check
  const MockRepToken = await ethers.getContractFactory("MockRepToken");
  const repToken = await MockRepToken.deploy();
  await repToken.waitForDeployment();
  console.log("MockRepToken deployed at:", await repToken.getAddress());

  // Mint rep to author so they can create projects
  await repToken.mint(author.address, ethers.parseEther("100"));
  console.log("Minted 100 REP to author");

  // Deploy Economy contract (with 5% arbitration fee = 500 bps)
  const Economy = await ethers.getContractFactory("Economy");
  const economy = await Economy.deploy(500);
  await economy.waitForDeployment();
  const economyAddress = await economy.getAddress();
  console.log("Economy deployed at:", economyAddress);

  // Deploy NativeProject implementation
  const NativeProject = await ethers.getContractFactory("NativeProject");
  const nativeProjectImpl = await NativeProject.deploy();
  await nativeProjectImpl.waitForDeployment();
  const nativeProjectAddress = await nativeProjectImpl.getAddress();
  console.log("NativeProject implementation at:", nativeProjectAddress);

  // Deploy ERC20Project implementation
  const ERC20Project = await ethers.getContractFactory("ERC20Project");
  const erc20ProjectImpl = await ERC20Project.deploy();
  await erc20ProjectImpl.waitForDeployment();
  const erc20ProjectAddress = await erc20ProjectImpl.getAddress();
  console.log("ERC20Project implementation at:", erc20ProjectAddress);

  // Set implementations on Economy
  await economy.setImplementations(nativeProjectAddress, erc20ProjectAddress);
  console.log("Set implementations on Economy");

  // Set up DAO addresses (use deployer as timelock for simplicity)
  await economy.setDaoAddresses(
    deployer.address, // timelock
    deployer.address, // registry
    deployer.address, // governor
    await repToken.getAddress()  // repToken
  );
  console.log("Set DAO addresses on Economy");

  // Set maxImmediateBps to 20% (2000 bps) for testing immediate release feature
  await economy.setMaxImmediateBps(2000);
  console.log("Set maxImmediateBps to 2000 (20%)");

  // Get economy config to verify
  const config = await economy.getConfig();
  console.log("\nEconomy Configuration:");
  console.log("  arbitrationFeeBps:", config.arbitrationFeeBps.toString());
  console.log("  platformFeeBps:", config.platformFeeBps.toString());
  console.log("  authorFeeBps:", config.authorFeeBps.toString());
  console.log("  maxImmediateBps:", config.maxImmediateBps.toString());
  console.log("  coolingOffPeriod:", config.coolingOffPeriod.toString());
  console.log("  backersVoteQuorumBps:", config.backersVoteQuorumBps.toString());

  // Create a test project
  console.log("\nCreating test project...");
  const createTx = await economy.connect(author).createProject(
    "Test Project",
    contractor.address,
    arbiter.address,
    "terms-hash-123",
    "https://github.com/test/repo",
    "A test project for local development"
  );
  const receipt = await createTx.wait();

  // Find NewProject event
  const newProjectEvent = receipt.logs.find(log => {
    try {
      const parsed = economy.interface.parseLog(log);
      return parsed.name === "NewProject";
    } catch (e) {
      return false;
    }
  });

  let projectAddress;
  if (newProjectEvent) {
    const parsed = economy.interface.parseLog(newProjectEvent);
    projectAddress = parsed.args.contractAddress;
    console.log("Test project created at:", projectAddress);
  }

  // Output deployment info
  console.log("\n========================================");
  console.log("Local Deployment Complete!");
  console.log("========================================");
  console.log("Economy:", economyAddress);
  console.log("NativeProject impl:", nativeProjectAddress);
  console.log("ERC20Project impl:", erc20ProjectAddress);
  console.log("RepToken:", await repToken.getAddress());
  console.log("Test Project:", projectAddress || "N/A");
  console.log("========================================");
  console.log("\nTest Accounts:");
  console.log("Deployer/Timelock:", deployer.address);
  console.log("Author:", author.address);
  console.log("Contractor:", contractor.address);
  console.log("Arbiter:", arbiter.address);
  console.log("Backer1:", backer1.address);
  console.log("Backer2:", backer2.address);
  console.log("========================================");

  // Return addresses for programmatic use
  return {
    economy: economyAddress,
    nativeProjectImpl: nativeProjectAddress,
    erc20ProjectImpl: erc20ProjectAddress,
    repToken: await repToken.getAddress(),
    testProject: projectAddress,
    accounts: {
      deployer: deployer.address,
      author: author.address,
      contractor: contractor.address,
      arbiter: arbiter.address,
      backer1: backer1.address,
      backer2: backer2.address
    }
  };
}

main()
  .then((addresses) => {
    // Output as JSON for easy parsing by other scripts
    console.log("\nJSON Output:");
    console.log(JSON.stringify(addresses, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

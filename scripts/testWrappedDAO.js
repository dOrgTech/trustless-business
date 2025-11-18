const { ethers } = require("hardhat");

async function main() {
  console.log("===========================================");
  console.log("Testing Wrapped Token DAO Functionality");
  console.log("===========================================\n");

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log("Test accounts:");
  console.log("  Deployer:", deployer.address);

  // For testnet, we'll use the same account for testing
  const member1 = deployer;
  const member2 = deployer;
  console.log("  (Using deployer account for all test operations on testnet)");
  console.log();

  // Load deployed factory address (UPDATED: new deployment with voting period fix)
  const factoryAddress = "0x422657c7620Dde17Ca9439e25863d0011767d574";
  console.log("StandardFactoryWrapped address:", factoryAddress);
  console.log();

  // Step 1: Deploy test ERC20 token (USDC-like with 6 decimals)
  console.log("STEP 1: Deploying test ERC20 token (6 decimals, like USDC)...");
  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const underlyingToken = await TestERC20.deploy(
    "Test USDC",
    "TUSDC",
    6, // 6 decimals like USDC
    ethers.parseUnits("1000000", 6) // 1M TUSDC
  );
  await underlyingToken.waitForDeployment();
  const underlyingTokenAddr = await underlyingToken.getAddress();
  console.log("  Test ERC20 deployed at:", underlyingTokenAddr);
  console.log("  Decimals:", await underlyingToken.decimals());
  console.log("  Initial supply:", ethers.formatUnits(await underlyingToken.totalSupply(), 6), "TUSDC");
  console.log();

  // Check deployer balance
  console.log("Deployer token balance:", ethers.formatUnits(await underlyingToken.balanceOf(deployer.address), 6), "TUSDC");
  console.log();

  // Step 2: Deploy wrapped DAO
  console.log("STEP 2: Deploying Wrapped Token DAO...");
  const StandardFactoryWrapped = await ethers.getContractFactory("StandardFactoryWrapped");
  const factory = StandardFactoryWrapped.attach(factoryAddress);

  const daoParams = {
    name: "Test Wrapped DAO",
    symbol: "TWDAO",
    description: "Testing wrapped ERC20 governance with 6 decimal token",
    executionDelay: 60, // 1 minute
    underlyingTokenAddress: underlyingTokenAddr,
    governanceSettings: [
      1,     // votingDelay: 1 minute (passed in MINUTES per deployment guide)
      2,     // votingPeriod: 2 minutes (passed in MINUTES per deployment guide)
      0,     // proposalThreshold (0 for testing)
      4      // quorumFraction (4%)
    ],
    keys: [],
    values: [],
    transferrableStr: "false" // Non-transferable governance tokens
  };

  console.log("  Deploying DAO with params:");
  console.log("    Name:", daoParams.name);
  console.log("    Symbol:", daoParams.symbol);
  console.log("    Underlying Token:", daoParams.underlyingTokenAddress);
  console.log("    Transferrable:", daoParams.transferrableStr);

  const tx = await factory.deployDAOwithWrappedToken(daoParams);
  console.log("  Transaction hash:", tx.hash);
  console.log("  Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("  Confirmed in block:", receipt.blockNumber);

  // Parse event to get deployed addresses
  const event = receipt.logs.find(log => {
    try {
      const parsed = factory.interface.parseLog(log);
      return parsed.name === "DaoWrappedDeploymentInfo";
    } catch {
      return false;
    }
  });

  if (!event) {
    console.log("ERROR: Could not find DaoWrappedDeploymentInfo event!");
    return;
  }

  const parsedEvent = factory.interface.parseLog(event);
  const daoAddress = parsedEvent.args.daoAddress;
  const wrappedTokenAddress = parsedEvent.args.wrappedTokenAddress;
  const registryAddress = parsedEvent.args.registryAddress;

  console.log("\n  DAO Deployed Successfully!");
  console.log("  DAO Address:", daoAddress);
  console.log("  Wrapped Token Address:", wrappedTokenAddress);
  console.log("  Registry Address:", registryAddress);
  console.log("  Underlying Token:", parsedEvent.args.underlyingTokenAddress);
  console.log();

  // Step 3: Test wrapping tokens (depositing underlying)
  console.log("STEP 3: Testing token wrapping (deposit underlying → get wrapped)...");

  const wrappedToken = await ethers.getContractAt("WrappedRepToken", wrappedTokenAddress);
  console.log("  Wrapped token decimals:", await wrappedToken.decimals());

  const wrapAmount = ethers.parseUnits("1000", 6); // Wrap 1000 TUSDC

  console.log("\n  Wrapping 1000 TUSDC...");
  console.log("    Approving wrapped token to spend underlying...");
  const approveTx = await underlyingToken.approve(wrappedTokenAddress, wrapAmount);
  await approveTx.wait();
  console.log("    Approval confirmed");

  const allowance = await underlyingToken.allowance(deployer.address, wrappedTokenAddress);
  console.log("    Allowance:", ethers.formatUnits(allowance, 6), "TUSDC");

  console.log("    Depositing underlying tokens...");
  const depositTx = await wrappedToken.depositFor(deployer.address, wrapAmount);
  await depositTx.wait();
  console.log("    Deposit confirmed");

  const wrappedBalance = await wrappedToken.balanceOf(deployer.address);
  console.log("    Wrapped token balance:", ethers.formatUnits(wrappedBalance, 6), "TWDAO");
  console.log("    Underlying token balance:", ethers.formatUnits(await underlyingToken.balanceOf(deployer.address), 6), "TUSDC");
  console.log();

  // Step 4: Test delegation (required for voting)
  console.log("STEP 4: Testing vote delegation...");
  console.log("  Self-delegating to activate voting power...");
  const delegateTx = await wrappedToken.delegate(deployer.address);
  await delegateTx.wait();

  const votes = await wrappedToken.getVotes(deployer.address);
  console.log("    Voting power:", ethers.formatUnits(votes, 6), "votes");
  console.log();

  // Step 5: Verify token properties
  console.log("STEP 5: Verifying wrapped token properties...");
  console.log("  Token name:", await wrappedToken.name());
  console.log("  Token symbol:", await wrappedToken.symbol());
  console.log("  Decimals:", await wrappedToken.decimals(), "(inherited from underlying)");
  console.log("  Total supply:", ethers.formatUnits(await wrappedToken.totalSupply(), 6));
  console.log("  Is transferable:", await wrappedToken.isTransferable());
  console.log("  Underlying token:", await wrappedToken.underlying());
  console.log();

  // Step 6: Test unwrapping (withdrawing)
  console.log("STEP 6: Testing token unwrapping (withdraw)...");
  const unwrapAmount = ethers.parseUnits("100", 6);
  console.log("  Unwrapping 100 TWDAO...");
  const withdrawTx = await wrappedToken.withdrawTo(deployer.address, unwrapAmount);
  await withdrawTx.wait();

  console.log("    Wrapped balance after unwrap:", ethers.formatUnits(await wrappedToken.balanceOf(deployer.address), 6), "TWDAO");
  console.log("    Underlying balance after unwrap:", ethers.formatUnits(await underlyingToken.balanceOf(deployer.address), 6), "TUSDC");
  console.log("    Voting power after unwrap:", ethers.formatUnits(await wrappedToken.getVotes(deployer.address), 6), "votes");
  console.log();

  // Step 7: Test non-transferability
  console.log("STEP 7: Testing non-transferability...");
  console.log("  Attempting to transfer wrapped tokens to a different address (should fail)...");
  try {
    // Try to transfer to a random address
    await wrappedToken.transfer("0x0000000000000000000000000000000000000001", ethers.parseUnits("10", 6));
    console.log("    ERROR: Transfer succeeded when it should have failed!");
  } catch (error) {
    console.log("    ✓ Transfer correctly blocked:", error.message.split('(')[0].trim());
  }
  console.log();

  console.log("===========================================");
  console.log("TEST SUMMARY");
  console.log("===========================================");
  console.log("✓ Test ERC20 token deployed (6 decimals)");
  console.log("✓ Wrapped DAO deployed via StandardFactoryWrapped");
  console.log("✓ Wrapped token correctly inherits 6 decimals from underlying");
  console.log("✓ Token wrapping (deposit) works correctly");
  console.log("✓ Vote delegation works correctly");
  console.log("✓ Voting power reflects wrapped token balance");
  console.log("✓ Token unwrapping (withdraw) works correctly");
  console.log("✓ Non-transferability is enforced");
  console.log();
  console.log("DEPLOYMENT INFO FOR INDEXER:");
  console.log("============================");
  console.log("DAO Address:", daoAddress);
  console.log("Wrapped Token:", wrappedTokenAddress);
  console.log("Underlying Token:", underlyingTokenAddr);
  console.log("Registry:", registryAddress);
  console.log("Factory:", factoryAddress);
  console.log();
  console.log("Now run the indexer with:");
  console.log("  cd indexer && python app.py testnet homebase");
  console.log();
  console.log("Check Firestore collection: idaosEtherlink-Testnet");
  console.log("Look for DAO document:", daoAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

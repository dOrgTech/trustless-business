const { ethers } = require('hardhat');

async function main() {
  console.log('========================================');
  console.log('DEPLOYING ALL FACTORIES TO ETHERLINK MAINNET');
  console.log('========================================\n');

  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance), 'XTZ\n');

  const addresses = {};

  // 1. Deploy InfrastructureFactory
  console.log('1. Deploying InfrastructureFactory...');
  const InfrastructureFactory = await ethers.getContractFactory('InfrastructureFactory');
  const infrastructureFactory = await InfrastructureFactory.deploy();
  await infrastructureFactory.waitForDeployment();
  addresses.infrastructureFactory = await infrastructureFactory.getAddress();
  console.log('   ✓ InfrastructureFactory:', addresses.infrastructureFactory);

  // 2. Deploy DAOFactory
  console.log('\n2. Deploying DAOFactory...');
  const DAOFactory = await ethers.getContractFactory('DAOFactory');
  const daoFactory = await DAOFactory.deploy();
  await daoFactory.waitForDeployment();
  addresses.daoFactory = await daoFactory.getAddress();
  console.log('   ✓ DAOFactory:', addresses.daoFactory);

  // 3. Deploy RepTokenFactory
  console.log('\n3. Deploying RepTokenFactory...');
  const RepTokenFactory = await ethers.getContractFactory('RepTokenFactory');
  const repTokenFactory = await RepTokenFactory.deploy();
  await repTokenFactory.waitForDeployment();
  addresses.repTokenFactory = await repTokenFactory.getAddress();
  console.log('   ✓ RepTokenFactory:', addresses.repTokenFactory);

  // 4. Deploy StandardFactory (Non-Transferable)
  console.log('\n4. Deploying StandardFactory (Non-Transferable)...');
  const StandardFactory = await ethers.getContractFactory('StandardFactory');
  const standardFactory = await StandardFactory.deploy(
    addresses.infrastructureFactory,
    addresses.daoFactory,
    addresses.repTokenFactory
  );
  await standardFactory.waitForDeployment();
  addresses.wrapper = await standardFactory.getAddress();
  console.log('   ✓ StandardFactory (wrapper):', addresses.wrapper);

  // 5. Deploy StandardFactoryTransferable
  console.log('\n5. Deploying StandardFactoryTransferable...');
  const StandardFactoryTransferable = await ethers.getContractFactory('StandardFactoryTransferable');
  const standardFactoryTransferable = await StandardFactoryTransferable.deploy(
    addresses.infrastructureFactory,
    addresses.daoFactory,
    addresses.repTokenFactory
  );
  await standardFactoryTransferable.waitForDeployment();
  addresses.wrapper_t = await standardFactoryTransferable.getAddress();
  console.log('   ✓ StandardFactoryTransferable (wrapper_t):', addresses.wrapper_t);

  // 6. Deploy WrappedRepTokenFactory
  console.log('\n6. Deploying WrappedRepTokenFactory...');
  const WrappedRepTokenFactory = await ethers.getContractFactory('WrappedRepTokenFactory');
  const wrappedRepTokenFactory = await WrappedRepTokenFactory.deploy();
  await wrappedRepTokenFactory.waitForDeployment();
  addresses.wrappedRepTokenFactory = await wrappedRepTokenFactory.getAddress();
  console.log('   ✓ WrappedRepTokenFactory:', addresses.wrappedRepTokenFactory);

  // 7. Deploy StandardFactoryWrapped
  console.log('\n7. Deploying StandardFactoryWrapped...');
  const StandardFactoryWrapped = await ethers.getContractFactory('StandardFactoryWrapped');
  const standardFactoryWrapped = await StandardFactoryWrapped.deploy(
    addresses.infrastructureFactory,
    addresses.daoFactory,
    addresses.wrappedRepTokenFactory
  );
  await standardFactoryWrapped.waitForDeployment();
  addresses.wrapper_w = await standardFactoryWrapped.getAddress();
  console.log('   ✓ StandardFactoryWrapped (wrapper_w):', addresses.wrapper_w);

  // 8. Deploy EconomyFactory
  console.log('\n8. Deploying EconomyFactory...');
  const EconomyFactory = await ethers.getContractFactory('EconomyFactory');
  const economyFactory = await EconomyFactory.deploy();
  await economyFactory.waitForDeployment();
  addresses.economyFactory = await economyFactory.getAddress();
  console.log('   ✓ EconomyFactory:', addresses.economyFactory);

  // 9. Deploy TrustlessFactory
  console.log('\n9. Deploying TrustlessFactory...');
  const TrustlessFactory = await ethers.getContractFactory('TrustlessFactory');
  const trustlessFactory = await TrustlessFactory.deploy(
    addresses.infrastructureFactory,
    addresses.daoFactory,
    addresses.repTokenFactory,
    addresses.economyFactory
  );
  await trustlessFactory.waitForDeployment();
  addresses.wrapper_trustless = await trustlessFactory.getAddress();
  console.log('   ✓ TrustlessFactory (wrapper_trustless):', addresses.wrapper_trustless);

  // Summary
  console.log('\n========================================');
  console.log('DEPLOYMENT COMPLETE');
  console.log('========================================\n');

  const finalBalance = await ethers.provider.getBalance(deployer.address);
  const gasUsed = balance - finalBalance;
  console.log('Gas used:', ethers.formatEther(gasUsed), 'XTZ');
  console.log('Remaining balance:', ethers.formatEther(finalBalance), 'XTZ\n');

  console.log('ADDRESSES FOR FIRESTORE (contracts/Etherlink):');
  console.log('------------------------------------------------');
  console.log(JSON.stringify({
    wrapper: addresses.wrapper,
    wrapper_t: addresses.wrapper_t,
    wrapper_w: addresses.wrapper_w,
    wrapper_trustless: addresses.wrapper_trustless
  }, null, 2));

  console.log('\nALL DEPLOYED ADDRESSES:');
  console.log('------------------------------------------------');
  console.log(JSON.stringify(addresses, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

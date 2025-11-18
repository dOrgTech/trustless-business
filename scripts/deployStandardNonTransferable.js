const { ethers } = require('hardhat');

async function main() {
  console.log('Deploying StandardFactoryNonTransferable to mainnet...\n');

  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance), 'XTZ\n');

  // Use existing sub-factory addresses
  const infrastructureFactory = '0xd56825E642360e50075bff916c8758674953DE88';
  const daoFactory = '0xDa5913901F57D95519aCbab28aFC15035C8E4C66';
  const repTokenFactory = '0xb79a401Ae0AFf7e3Aa133720b5880dFc590860BB';

  console.log('Using existing sub-factories:');
  console.log('  InfrastructureFactory:', infrastructureFactory);
  console.log('  DAOFactory:', daoFactory);
  console.log('  RepTokenFactory:', repTokenFactory);
  console.log();

  console.log('Deploying StandardFactoryNonTransferable...');
  const StandardFactoryNonTransferable = await ethers.getContractFactory('StandardFactoryNonTransferable');
  const factory = await StandardFactoryNonTransferable.deploy(
    infrastructureFactory,
    daoFactory,
    repTokenFactory
  );
  await factory.waitForDeployment();

  const newAddress = await factory.getAddress();
  console.log('✓ StandardFactoryNonTransferable deployed:', newAddress);

  const finalBalance = await ethers.provider.getBalance(deployer.address);
  const gasUsed = balance - finalBalance;
  console.log('\nGas used:', ethers.formatEther(gasUsed), 'XTZ');
  console.log('Remaining balance:', ethers.formatEther(finalBalance), 'XTZ\n');

  console.log('UPDATE FIRESTORE:');
  console.log('contracts/Etherlink/wrapper:', newAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

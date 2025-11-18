const { ethers } = require('hardhat');

async function main() {
  const factory = await ethers.getContractAt('StandardFactoryWrapped', '0x5CE75b733c530E94Ae1786FB51Ee269B6e4dA940');

  // Get events from the factory
  const filter = factory.filters.DaoWrappedDeploymentInfo();
  const events = await factory.queryFilter(filter, 22769099, 22769099);

  console.log('Found', events.length, 'DaoWrappedDeploymentInfo events in block 22769099');
  for (const event of events) {
    console.log('\nEvent:');
    console.log('  DAO:', event.args.daoAddress);
    console.log('  Wrapped Token:', event.args.wrappedTokenAddress);
    console.log('  Underlying:', event.args.underlyingTokenAddress);
    console.log('  Name:', event.args.daoName);
    console.log('  Symbol:', event.args.wrappedTokenSymbol);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

const { ethers } = require('hardhat');

async function main() {
  console.log('Testing DAO deployment with 0 voting delay...\n');

  const [deployer] = await ethers.getSigners();

  // Use mainnet factory address
  const factoryAddress = '0x64628bE2b7E5542750b6Ee1cc7748f85e9535C76';
  const factory = await ethers.getContractAt('StandardFactory', factoryAddress);

  const params = {
    name: 'Test Zero Delay',
    symbol: 'TZD',
    description: 'Testing zero voting delay',
    decimals: 18,
    executionDelay: 86400,
    initialMembers: [deployer.address],
    initialAmounts: [
      ethers.parseEther('900'),  // Initial tokens
      0,      // votingDelay - ZERO
      10080,  // votingPeriod
      1,      // proposalThreshold
      10      // quorumFraction
    ],
    keys: [],
    values: [],
    transferrableStr: 'false'
  };

  console.log('Parameters:');
  console.log('  votingDelay:', params.initialAmounts[1], 'minutes');
  console.log('  votingPeriod:', params.initialAmounts[2], 'minutes');

  try {
    console.log('\nAttempting deployment...');
    const tx = await factory.deployDAOwithToken(params);
    console.log('Transaction sent:', tx.hash);
    await tx.wait();
    console.log('SUCCESS: Deployment worked with 0 voting delay!');
  } catch (error) {
    console.log('ERROR: Deployment failed!');
    console.log('Error message:', error.message);

    // Try with non-zero voting delay
    console.log('\n\nRetrying with votingDelay = 1 minute...');
    params.initialAmounts[1] = 1;

    try {
      const tx2 = await factory.deployDAOwithToken(params);
      console.log('Transaction sent:', tx2.hash);
      await tx2.wait();
      console.log('SUCCESS: Deployment worked with votingDelay = 1!');
    } catch (error2) {
      console.log('ERROR: Still failed with votingDelay = 1');
      console.log('Error:', error2.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

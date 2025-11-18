const { ethers } = require('hardhat');

async function main() {
  const provider = ethers.provider;

  // Get logs for block 22769099
  const logs = await provider.getLogs({
    fromBlock: 22769099,
    toBlock: 22769099,
    address: '0x5CE75b733c530E94Ae1786FB51Ee269B6e4dA940'  // StandardFactoryWrapped
  });

  console.log(`Found ${logs.length} logs in block 22769099`);
  for (const log of logs) {
    console.log('\nLog entry:');
    console.log('  Address:', log.address);
    console.log('  Topics:', log.topics);
    console.log('  Topic[0] (event sig):', log.topics[0]);
    console.log('  Data length:', log.data.length);
  }

  // Calculate what we expect
  const sig = 'DaoWrappedDeploymentInfo(address,address,address,address,string,string,string,uint8,uint256,uint48,uint32,uint256)';
  const hash = ethers.keccak256(ethers.toUtf8Bytes(sig));
  console.log('\nExpected signature:', sig);
  console.log('Expected hash:', hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

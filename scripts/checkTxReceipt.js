const { ethers } = require('hardhat');

async function main() {
  const txHash = '0x24f0d6c235ffe51cd62af6c2e14ecff14f6f990b957e563c858db2b1f9f61bf7';

  console.log("Checking transaction:", txHash, "\n");

  const receipt = await ethers.provider.getTransactionReceipt(txHash);

  if (!receipt) {
    console.log("Transaction not found or not mined yet");
    return;
  }

  console.log('Transaction receipt:');
  console.log('Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
  console.log('Gas used:', receipt.gasUsed.toString());
  console.log('Block:', receipt.blockNumber);

  // Get the events
  const factory = await ethers.getContractAt('StandardFactory', '0x4962e5cCBfE4258B9229bfff705cCacA4379f49f');

  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed && parsed.name === 'NewDaoCreated') {
        console.log('\n*** DAO Created Successfully! ***');
        console.log('DAO Address:', parsed.args.daoAddress);
        console.log('Token Address:', parsed.args.tokenAddress);
        console.log('Creator:', parsed.args.creator);

        // Check if this token has mint/burn
        const token = await ethers.getContractAt('RepToken', parsed.args.tokenAddress);
        const admin = await token.admin();
        const isTransferable = await token.isTransferable();

        console.log('\nToken Info:');
        console.log('Admin:', admin);
        console.log('isTransferable:', isTransferable);

        // Check for mint function
        const [signer] = await ethers.getSigners();
        try {
          await token.mint.staticCall(signer.address, 1);
        } catch (e) {
          if (e.message.includes('Only admin')) {
            console.log('Has mint() function: YES ✓');
          } else {
            console.log('Has mint() function: NO ✗');
            console.log('Error:', e.message);
          }
        }
      }
    } catch (e) {
      // Not a factory event
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

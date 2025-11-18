const admin = require('firebase-admin');
const path = require('path');

async function updateFirestoreConfig() {
  // Initialize Firebase Admin
  const serviceAccount = require(path.join(__dirname, '../../indexer/homebase.json'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  // New deployment addresses from mainnet deployment
  const newAddresses = {
    wrapper: '0x0FDAA3f498ba097A6b180998cF0A663865F3fcd6',
    wrapper_t: '0xF69C9654623dB68F264F4153CEE261881805339D',
    wrapper_w: '0x55696f882A187367BD9Bb870268acaE64DA5254f',
    wrapper_trustless: '0x531954E9D097cB2ca5b1e5f22F35146e0A451068',
    infrastructureFactory: '0x051e2B5BcA621edb6D12347d29013b2434be2C86',
    daoFactory: '0x6bb8cF829fdB3E6ED0CC355F593D02C05137d63D',
    repTokenFactory: '0xAF82967b79ad8424f7167B8325B15bcb97AC57C9',
    wrappedRepTokenFactory: '0x8D79b7f2fdf2A1708FF7b9D62BBdDe3438df47aE',
    economyFactory: '0x12C6D842DF3513ace061484EC3435700ee6d6Ba3'
  };

  console.log('Updating Firestore configuration for Etherlink (MAINNET)...\n');

  try {
    // Update contracts collection
    const contractsRef = db.collection('contracts').doc('Etherlink');
    const contractsDoc = await contractsRef.get();

    if (!contractsDoc.exists) {
      console.log('Creating new Etherlink document...');
      await contractsRef.set({
        ...newAddresses,
        rpc: 'https://node.mainnet.etherlink.com'
      });
    } else {
      console.log('Updating existing Etherlink document...');
      const currentData = contractsDoc.data();
      await contractsRef.update(newAddresses);

      console.log('\nPrevious configuration:');
      console.log('  wrapper:', currentData.wrapper || 'N/A');
      console.log('  wrapper_w:', currentData.wrapper_w || 'N/A');
      console.log('  wrapper_trustless:', currentData.wrapper_trustless || 'N/A');
    }

    console.log('\nNew configuration:');
    console.log('  wrapper:', newAddresses.wrapper);
    console.log('  wrapper_t:', newAddresses.wrapper_t);
    console.log('  wrapper_w:', newAddresses.wrapper_w);
    console.log('  wrapper_trustless:', newAddresses.wrapper_trustless);
    console.log('  infrastructureFactory:', newAddresses.infrastructureFactory);
    console.log('  daoFactory:', newAddresses.daoFactory);
    console.log('  repTokenFactory:', newAddresses.repTokenFactory);
    console.log('  wrappedRepTokenFactory:', newAddresses.wrappedRepTokenFactory);
    console.log('  economyFactory:', newAddresses.economyFactory);

    console.log('\n✅ Firestore updated successfully!');

  } catch (error) {
    console.error('Error updating Firestore:', error);
    process.exit(1);
  }

  process.exit(0);
}

updateFirestoreConfig();

const admin = require('firebase-admin');
const path = require('path');

async function updateFirestoreConfig() {
  // Initialize Firebase Admin
  const serviceAccount = require(path.join(__dirname, '../../indexer/homebase.json'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  // New deployment addresses from deployments
  const newAddresses = {
    wrapper: '0x4962e5cCBfE4258B9229bfff705cCacA4379f49f',
    wrapper_w: '0x39FF60f3dB4DD2054e5b6d5f8bE9782a45D0AbF2',
    infrastructureFactory: '0x47772dab1624629Bf08ddd84db25BE74a2783A0C',
    daoFactory: '0x09Ae4908793FB6940d1F7Dc44C8FE5003d6717e8',
    repTokenFactory: '0x89Cf79EbeF73e259CEb5D0Da3b52bec70Ba97ADF',
    wrappedRepTokenFactory: '0x270b1fd9CeC32a3972BcA8f5De78679A9E7D64ca'
  };

  console.log('Updating Firestore configuration for Etherlink-Testnet...\n');

  try {
    // Update contracts collection
    const contractsRef = db.collection('contracts').doc('Etherlink-Testnet');
    const contractsDoc = await contractsRef.get();

    if (!contractsDoc.exists) {
      console.log('Creating new Etherlink-Testnet document...');
      await contractsRef.set({
        ...newAddresses,
        rpc: 'https://node.ghostnet.etherlink.com'
      });
    } else {
      console.log('Updating existing Etherlink-Testnet document...');
      const currentData = contractsDoc.data();
      await contractsRef.update(newAddresses);

      console.log('\nPrevious configuration:');
      console.log('  wrapper:', currentData.wrapper || 'N/A');
      console.log('  wrapper_w:', currentData.wrapper_w || 'N/A');
    }

    console.log('\nNew configuration:');
    console.log('  wrapper:', newAddresses.wrapper);
    console.log('  wrapper_w:', newAddresses.wrapper_w);
    console.log('  infrastructureFactory:', newAddresses.infrastructureFactory);
    console.log('  daoFactory:', newAddresses.daoFactory);
    console.log('  repTokenFactory:', newAddresses.repTokenFactory);
    console.log('  wrappedRepTokenFactory:', newAddresses.wrappedRepTokenFactory);

    console.log('\n✅ Firestore updated successfully!');

  } catch (error) {
    console.error('Error updating Firestore:', error);
    process.exit(1);
  }

  process.exit(0);
}

updateFirestoreConfig();

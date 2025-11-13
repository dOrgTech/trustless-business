const admin = require('firebase-admin');
const path = require('path');

async function updateFirestoreConfig() {
  // Initialize Firebase Admin
  const serviceAccount = require(path.join(__dirname, '../../indexer/homebase.json'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  // New deployment addresses
  const newAddresses = {
    wrapper_jurisdiction: '0xeB8b60D4daa79fDBfEfe72d75cD1c2A5c65D9445',
    infrastructureFactory: '0xa5edE5fC3ade4158A0f956d576CA2A9478Dc7073',
    daoFactory: '0x35497b17d5eb8d0E0c689292522505bA40f14A35',
    repTokenFactory: '0x8FDc5efa581918AF435E515426b646C15EaC11cb'
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
      console.log('  wrapper_jurisdiction:', currentData.wrapper_jurisdiction || 'N/A');
      console.log('  wrapper_w:', currentData.wrapper_w || 'N/A');
    }

    console.log('\nNew configuration:');
    console.log('  wrapper_jurisdiction:', newAddresses.wrapper_jurisdiction);
    console.log('  infrastructureFactory:', newAddresses.infrastructureFactory);
    console.log('  daoFactory:', newAddresses.daoFactory);
    console.log('  repTokenFactory:', newAddresses.repTokenFactory);

    console.log('\n✅ Firestore updated successfully!');
    console.log('\nNext step: Restart the indexer on the production server:');
    console.log('  sudo systemctl restart indexer@testnet');
    console.log('  journalctl -u indexer@testnet -f');

  } catch (error) {
    console.error('Error updating Firestore:', error);
    process.exit(1);
  }

  process.exit(0);
}

updateFirestoreConfig();

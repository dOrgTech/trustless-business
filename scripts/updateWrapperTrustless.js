const admin = require('firebase-admin');
const path = require('path');

async function updateWrapperTrustless() {
  // Initialize Firebase Admin
  const serviceAccount = require(path.join(__dirname, '../../indexer/homebase.json'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  // New TrustlessFactory address from the parity fix deployment
  const newTrustlessFactory = '0x0793ae66037a64b0f8d3cdc57f890CE2ba9B71b9';

  console.log('Updating Firestore wrapper_trustless for Etherlink-Testnet...\n');

  try {
    const contractsRef = db.collection('contracts').doc('Etherlink-Testnet');
    const contractsDoc = await contractsRef.get();

    if (!contractsDoc.exists) {
      console.error('Etherlink-Testnet document does not exist!');
      process.exit(1);
    }

    const currentData = contractsDoc.data();
    console.log('Previous wrapper_trustless:', currentData.wrapper_trustless || 'N/A');

    await contractsRef.update({
      wrapper_trustless: newTrustlessFactory
    });

    console.log('New wrapper_trustless:', newTrustlessFactory);
    console.log('\nFirestore updated successfully!');

  } catch (error) {
    console.error('Error updating Firestore:', error);
    process.exit(1);
  }

  process.exit(0);
}

updateWrapperTrustless();

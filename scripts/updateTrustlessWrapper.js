const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function updateTrustlessWrapper() {
  // Load deployment info
  const deploymentPath = path.join(__dirname, '..', 'deployments', 'etherlink-testnet-trustless.json');
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const trustlessFactoryAddr = deploymentInfo.contracts.trustlessFactory;

  // Initialize Firebase Admin
  const serviceAccount = require(path.join(__dirname, '../../indexer/homebase.json'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  console.log('Updating wrapper_trustless in Firestore for Etherlink-Testnet...\n');
  console.log('New TrustlessFactory address:', trustlessFactoryAddr);

  try {
    const contractsRef = db.collection('contracts').doc('Etherlink-Testnet');
    const contractsDoc = await contractsRef.get();

    if (!contractsDoc.exists) {
      console.log('ERROR: Etherlink-Testnet document does not exist!');
      process.exit(1);
    }

    const currentData = contractsDoc.data();
    console.log('\nPrevious wrapper_trustless:', currentData.wrapper_trustless || 'N/A');

    await contractsRef.update({
      wrapper_trustless: trustlessFactoryAddr
    });

    console.log('New wrapper_trustless:', trustlessFactoryAddr);
    console.log('\n✅ Firestore updated successfully!');

  } catch (error) {
    console.error('Error updating Firestore:', error);
    process.exit(1);
  }

  process.exit(0);
}

updateTrustlessWrapper();

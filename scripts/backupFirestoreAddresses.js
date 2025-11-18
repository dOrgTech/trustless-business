const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function backupFirestoreAddresses() {
  // Initialize Firebase Admin
  const serviceAccount = require(path.join(__dirname, '../../indexer/homebase.json'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  console.log('Backing up Firestore contract addresses...\n');

  try {
    const backup = {
      timestamp: new Date().toISOString(),
      networks: {}
    };

    // Backup Testnet
    const testnetRef = db.collection('contracts').doc('Etherlink-Testnet');
    const testnetDoc = await testnetRef.get();
    if (testnetDoc.exists) {
      backup.networks['Etherlink-Testnet'] = testnetDoc.data();
      console.log('✓ Backed up Etherlink-Testnet addresses');
    }

    // Backup Mainnet
    const mainnetRef = db.collection('contracts').doc('Etherlink');
    const mainnetDoc = await mainnetRef.get();
    if (mainnetDoc.exists) {
      backup.networks['Etherlink'] = mainnetDoc.data();
      console.log('✓ Backed up Etherlink (mainnet) addresses');
    }

    // Save to file
    const backupPath = path.join(__dirname, '..', 'deployments', `firestore-backup-${Date.now()}.json`);
    const backupDir = path.dirname(backupPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    console.log('\n✅ Backup saved to:', backupPath);
    console.log('\nBackup contents:');
    console.log(JSON.stringify(backup, null, 2));

  } catch (error) {
    console.error('Error backing up Firestore:', error);
    process.exit(1);
  }

  process.exit(0);
}

backupFirestoreAddresses();

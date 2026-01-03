const admin = require('firebase-admin');
const path = require('path');

async function updateFirestoreConfig() {
  // Initialize Firebase Admin
  const serviceAccount = require(path.join(__dirname, '../../indexer/homebase.json'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  // New deployment addresses from deployments (Jan 2, 2025 - arbitration fixes + RepToken parity fix)
  const newAddresses = {
    wrapper: '0x240dc76D5f879cB9D7966B94d317998A6c4Bd6DE', // standard non-transferable DAOs (restored)
    wrapper_w: '0x39FF60f3dB4DD2054e5b6d5f8bE9782a45D0AbF2', // unchanged - wrapped token DAOs
    wrapper_trustless: '0xd92a046a681db2473A6a4C826D85C0847EAF26Bd', // Economy DAO factory (new)
    infrastructureFactory: '0xaAee6c3C383D8f85920977375561fcb7CdA5543b',
    daoFactory: '0x72C0413227418e4C1bbA40559c762c15A1417db7',
    economyFactory: '0x3Af1502Fee70f3381500D575cEC739BB52b9CF6F',
    repTokenFactory: '0x6D06508228faBC008F6e40C6FE7A0ccCB8B0E963',
    wrappedRepTokenFactory: '0x270b1fd9CeC32a3972BcA8f5De78679A9E7D64ca', // unchanged
    nativeProjectImpl: '0x3C26D9dd718570bD35E41BC29c495eaa7F7a77cF',
    erc20ProjectImpl: '0xFadEB439f02E95d1e30953671900c8979dBa4CCa'
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
    console.log('  wrapper_trustless:', newAddresses.wrapper_trustless);
    console.log('  infrastructureFactory:', newAddresses.infrastructureFactory);
    console.log('  daoFactory:', newAddresses.daoFactory);
    console.log('  economyFactory:', newAddresses.economyFactory);
    console.log('  repTokenFactory:', newAddresses.repTokenFactory);
    console.log('  wrappedRepTokenFactory:', newAddresses.wrappedRepTokenFactory);
    console.log('  nativeProjectImpl:', newAddresses.nativeProjectImpl);
    console.log('  erc20ProjectImpl:', newAddresses.erc20ProjectImpl);

    console.log('\n✅ Firestore updated successfully!');

  } catch (error) {
    console.error('Error updating Firestore:', error);
    process.exit(1);
  }

  process.exit(0);
}

updateFirestoreConfig();

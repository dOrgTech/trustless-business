const { ethers } = require("hardhat");

// Based on the Firestore data:
// Name: None (empty)
// Type: Mint OMD
// Description: tokens
// External Resource: https://masdasd

const possibleDescriptions = [
  '0|||0Mint OMD0|||0tokens0|||0https://masdasd',
  'None0|||0Mint OMD0|||0tokens0|||0https://masdasd',
  'Mint OMD0|||0tokens0|||0https://masdasd',
  '0|||0Mint OMD0|||0tokens0|||0(No Link Provided)',
  'tokens',
];

console.log('Testing possible description formats:\n');
possibleDescriptions.forEach((desc, i) => {
  const hash = ethers.id(desc);
  console.log(`Option ${i + 1}: "${desc}"`);
  console.log(`Hash: ${hash}\n`);
});

async function main() {
  // Nothing to do, just run the above
}

main();

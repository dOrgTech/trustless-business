const { ethers } = require('hardhat');

async function main() {
  const StandardFactory = await ethers.getContractFactory('StandardFactory');
  const iface = StandardFactory.interface;

  console.log('StandardFactory function signatures:\n');
  iface.forEachFunction((func) => {
    if (func.name.includes('deploy')) {
      console.log(func.selector, '-', func.format('full'));
    }
  });

  // Check what 0x4cfff150 is
  console.log('\nLooking for selector 0x4cfff150...');
  const targetSelector = '0x4cfff150';
  iface.forEachFunction((func) => {
    if (func.selector === targetSelector) {
      console.log('FOUND:', func.format('full'));
    }
  });
}

main();

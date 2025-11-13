const abi = require('../artifacts/contracts/factories/StandardFactory.sol/StandardFactory.json').abi;

const funcs = abi.filter(f => f.type === 'function' && f.name === 'deployDAOwithToken');

console.log(`Found ${funcs.length} deployDAOwithToken functions:\n`);

funcs.forEach((f, i) => {
  const params = f.inputs.map(p => `${p.type} ${p.name}`).join(', ');
  console.log(`${i+1}. deployDAOwithToken(${params})`);
  console.log('');
});

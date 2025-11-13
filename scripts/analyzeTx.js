const { ethers } = require("hardhat");

async function main() {
  const txHash = "0xf04a724007d62e5d436837d0c3b78cf2fe5e6f723d9b5f624667ab0d35973135";

  console.log("Analyzing transaction...\n");
  console.log(`Tx Hash: ${txHash}\n`);

  const provider = ethers.provider;
  const tx = await provider.getTransaction(txHash);

  if (!tx) {
    console.error("Transaction not found!");
    return;
  }

  console.log(`From: ${tx.from}`);
  console.log(`To: ${tx.to}`);
  console.log(`Value: ${ethers.formatEther(tx.value)} ETH`);
  console.log(`Block: ${tx.blockNumber}\n`);

  // Get function selector
  const selector = tx.data.substring(0, 10);
  console.log(`Function Selector: ${selector}`);

  // Known selectors
  const selectors = {
    "0x3c99ea13": "deployDAOwithToken(..., string transferrableStr) - STRING VERSION ✅",
    "0x638a3f76": "deployDAOwithToken(..., bool transferrable) - BOOL VERSION ❌",
    "0x16d08280": "deployDAOwithToken(struct) - STRUCT VERSION"
  };

  if (selectors[selector]) {
    console.log(`Matched: ${selectors[selector]}\n`);
  } else {
    console.log(`Unknown selector\n`);
  }

  // Try to decode the call data
  console.log("Raw transaction data (first 300 chars):");
  console.log(tx.data.substring(0, 300) + "...\n");

  // Get the StandardFactory ABI
  const StandardFactory = await ethers.getContractFactory("StandardFactory");
  const iface = StandardFactory.interface;

  try {
    const decoded = iface.parseTransaction({ data: tx.data });
    console.log("Decoded function call:");
    console.log(`  Function: ${decoded.name}`);
    console.log(`  Fragment: ${decoded.fragment.format("full")}`);
    console.log("\nDecoded parameters:");

    decoded.fragment.inputs.forEach((input, i) => {
      const value = decoded.args[i];
      if (input.name === "transferrableStr" || input.name === "transferrable") {
        console.log(`  ${input.name} (${input.type}): ${value} ← THIS IS THE KEY PARAMETER`);
      } else if (Array.isArray(value) && value.length > 5) {
        console.log(`  ${input.name} (${input.type}): [${value.length} items]`);
      } else if (Array.isArray(value)) {
        console.log(`  ${input.name} (${input.type}): ${JSON.stringify(value)}`);
      } else {
        console.log(`  ${input.name} (${input.type}): ${value}`);
      }
    });
  } catch (error) {
    console.error("Failed to decode transaction:", error.message);
  }

  // Get transaction receipt to see the result
  const receipt = await provider.getTransactionReceipt(txHash);
  console.log(`\nTransaction Status: ${receipt.status === 1 ? "✅ Success" : "❌ Failed"}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

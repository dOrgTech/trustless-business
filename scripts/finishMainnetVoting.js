const { ethers } = require("hardhat");

const DAO_ADDRESS = "0x3355cECD8958C8b80A1503E9B8Bf960546cEC741";

const PROPOSALS = [
  { id: "73994462166464071419631168554133853580102707542437564420754972452834127494421", name: "Mint" },
  { id: "88198490749870649238132737633748013839783646878989475187875596187626416355598", name: "Burn" },
  { id: "50940264786949153164668359049326598477263498382467059562943274326283013409779", name: "Transfer ERC20" },
  { id: "68144466297519196219884855011449042711301057225149355571292658305553801880796", name: "Registry Edit" },
  { id: "38953744868209265272176501980772046375077086318614329988482519672419377504373", name: "Batch DAO Config" }
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking and completing votes on mainnet DAO...\n");
  console.log("DAO:", DAO_ADDRESS);
  console.log("Deployer:", deployer.address, "\n");

  const dao = await ethers.getContractAt("HomebaseDAO", DAO_ADDRESS);

  for (const prop of PROPOSALS) {
    console.log(`${prop.name}:`);

    // Check if already voted
    const hasVoted = await dao.hasVoted(prop.id, deployer.address);

    if (hasVoted) {
      console.log("  ✓ Already voted\n");
    } else {
      console.log("  → Voting YES...");
      await dao.castVote(prop.id, 1); // 1 = For
      console.log("  ✓ Voted\n");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log("=".repeat(80));
  console.log("All proposals have votes!");
  console.log("=".repeat(80));
  console.log("\nNext: Wait 1 minute for voting period, then queue & execute via web app");
  console.log("=".repeat(80) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

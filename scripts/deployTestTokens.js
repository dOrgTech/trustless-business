const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy TestToken18 (18 decimals)
  console.log("\nDeploying TestToken18...");
  const TestToken18 = await hre.ethers.getContractFactory("TestToken18");
  const token18 = await TestToken18.deploy();
  await token18.waitForDeployment();
  const token18Address = await token18.getAddress();
  console.log("TestToken18 deployed to:", token18Address);

  // Deploy TestToken6 (6 decimals)
  console.log("\nDeploying TestToken6...");
  const TestToken6 = await hre.ethers.getContractFactory("TestToken6");
  const token6 = await TestToken6.deploy();
  await token6.waitForDeployment();
  const token6Address = await token6.getAddress();
  console.log("TestToken6 deployed to:", token6Address);

  // Deploy TestNFT
  console.log("\nDeploying TestNFT...");
  const TestNFT = await hre.ethers.getContractFactory("TestNFT");
  const nft = await TestNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("TestNFT deployed to:", nftAddress);

  // Save addresses to file
  const output = `Deployed Test Tokens - Etherlink Mainnet
=========================================

ERC20 Token (18 decimals):
  Name: Test Token 18
  Symbol: TT18
  Address: ${token18Address}

ERC20 Token (6 decimals):
  Name: Test Token 6
  Symbol: TT6
  Address: ${token6Address}

ERC721 NFT:
  Name: Test NFT
  Symbol: TNFT
  Address: ${nftAddress}

Deployer: ${deployer.address}
Network: Etherlink Mainnet (chainId: 42793)
Date: ${new Date().toISOString()}
`;

  fs.writeFileSync("deployed-test-tokens.txt", output);
  console.log("\nAddresses saved to deployed-test-tokens.txt");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

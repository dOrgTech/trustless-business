// scripts/deploy.js
// This script uses the canonical Ethers.js browser provider to guarantee it works in Remix.
// It bypasses the buggy UI for complex arguments.

async function main() {
    console.log("--- Preparing Final Transaction (Corrected for Remix Environment) ---");

    // =================================================================================
    // CONFIGURATION - All addresses are pre-filled for you. No changes needed.
    // =================================================================================

    const TRUSTLESS_FACTORY_ADDRESS = "0xd6e80ad371cbEA6AdDd4B34FBa0d901304c6a67b";

    const NATIVE_PROJECT_IMPL = "0xcb88c0cbbb7422310de546e7a69099f65b5008eb";
    const ERC20_PROJECT_IMPL = "0x26a682eb805846013e6b930571b721bdb13c096f";

    const ECONOMY_ADDR = "0x7f77960ce71cec1289799ab797b82b6590b2b0f9";
    const REGISTRY_ADDR = "0x5a6066cb8e572860e1d2af3d94df714195a617b";
    const TIMELOCK_ADDR = "0x2c9a3964677583f85a55bd3620d78bb9998cfbcd";
    const REPTOKEN_ADDR = "0x79d0237317bd9e7f28a0172bc82aeebaeaebb6a2";
    const DAO_ADDR = "0x4e93d0ff9f69a42889c480c9b25f1247ee7bc930";
    
    // =================================================================================
    // SCRIPT LOGIC - DO NOT EDIT
    // =================================================================================
    
    console.log("Connecting to browser wallet...");
    // THE FIX: This is the correct, standard way to get a signer in any browser environment.
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    console.log("Using account:", signer.address);

    console.log("Getting contract artifact for TrustlessFactory...");
    const factoryArtifact = await remix.artifacts.getArtifact("contracts/factories/TrustlessFactory.sol:TrustlessFactory");
    const trustlessFactory = new ethers.Contract(TRUSTLESS_FACTORY_ADDRESS, factoryArtifact.abi, signer);
    
    const addressParams = {
        implAddresses: [NATIVE_PROJECT_IMPL, ERC20_PROJECT_IMPL],
        contractAddresses: [ECONOMY_ADDR, REGISTRY_ADDR, TIMELOCK_ADDR, REPTOKEN_ADDR, DAO_ADDR]
    };
    const economyParams = {
        initialPlatformFeeBps: 100,
        initialAuthorFeeBps: 100,
        initialCoolingOffPeriod: 60,
        initialBackersQuorumBps: 7000,
        initialProjectThreshold: 0,
        initialAppealPeriod: 120
    };

    console.log("Sending configureAndFinalize transaction...");
    console.log("Please check your wallet (Metamask) to confirm the transaction.");

    const tx = await trustlessFactory.configureAndFinalize(
        addressParams,
        economyParams
    );

    console.log("Transaction sent! Hash:", tx.hash);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();

    console.log("✅ ✅ ✅ TRANSACTION SUCCEEDED! ✅ ✅ ✅");
    console.log("The entire DAO suite has been successfully deployed and configured.");
    console.log("Transaction confirmed in block:", receipt.blockNumber);
}

main().catch((error) => {
    console.error("❌ --- TRANSACTION FAILED --- ❌");
    console.error(error);
});
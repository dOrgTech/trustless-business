# Transferability Fix - Summary

## Problem
The Flutter web app was always creating transferable tokens, even when passing `"false"` as the transferrability parameter. This happened because:

1. **JavaScript/Dart type coercion**: `Boolean("false") === true` in JavaScript
2. **Cached ABI issue**: The Flutter app had a cached ABI with `bool transferrable` parameter
3. **Struct encoding**: The app was calling the struct version with a bool parameter

## Solution
Deployed a new StandardFactory that supports **backward compatibility** with multiple overloads:

### Three Function Signatures:

1. **Legacy struct with bool** (for cached ABIs):
```solidity
function deployDAOwithToken(DaoParamsLegacy memory legacyParams)
// DaoParamsLegacy has: bool transferrable
```

2. **Individual parameters with string**:
```solidity
function deployDAOwithToken(..., string memory transferrableStr)
```

3. **New struct with string**:
```solidity
function deployDAOwithToken(DaoParams memory params)
// DaoParams has: string transferrableStr
```

All three overloads convert to a common internal format where only the string `"true"` (case-sensitive) results in transferable tokens.

## Deployment Details

**Network**: Etherlink Testnet (chainId 128123)

**New Addresses**:
- StandardFactory (wrapper): `0x1F19eFDE526Ab2ef32eF5Db66Cd858D3E5f00B0a`
- InfrastructureFactory: `0x727eC93332AE854a23AedbEd2c0585Da89BcA125`
- DAOFactory: `0x5963490f9d4A0aD0a1b0f6a3ff2436a1fEF6A6b9`
- RepTokenFactory: `0xeA00dfBDf6A6241B35140d8EC8456ab83838f8Bc`

**Firestore**: Updated `contracts/Etherlink-Testnet` document with new wrapper address

## Next Steps

### 1. Restart the Indexer
On your production server:
```bash
sudo systemctl restart indexer@testnet
sudo journalctl -u indexer@testnet -f
```

### 2. Test the Fix
Run the test script:
```bash
cd trustless-contracts
npx hardhat run scripts/testTransferability.js --network et
```

This will:
- Deploy a test DAO with `"false"` parameter
- Attempt to transfer tokens
- Verify the transfer is correctly rejected

### 3. Test from Flutter App
Try creating a DAO from your Flutter web app:
- Set transferrable parameter to `false` (or `"false"`)
- Deploy the DAO
- Check the token contract - try transferring tokens
- They should be rejected with "Reputation is non-transferable"

## How It Works

```
Flutter App (cached ABI with bool)
    ↓
Sends transaction with DaoParamsLegacy struct { ..., transferrable: false }
    ↓
StandardFactory.deployDAOwithToken(DaoParamsLegacy)
    ↓
Converts: bool false → string "false"
    ↓
Calls: deployDAOwithToken(DaoParams with transferrableStr: "false")
    ↓
Main function: keccak256("false") != keccak256("true") → transferrable = false
    ↓
RepToken deployed with isTransferable = false
    ↓
✅ Token correctly rejects transfers
```

## Verification

To verify a deployed token is non-transferable:

```javascript
const RepToken = await ethers.getContractFactory("RepToken");
const token = RepToken.attach("TOKEN_ADDRESS");

// Try to transfer - should revert
try {
  await token.transfer(recipient, amount);
  console.log("❌ BUG: Transfer succeeded");
} catch (error) {
  console.log("✅ CORRECT: Transfer rejected");
}
```

## Previous Deployments (Broken)

These StandardFactory deployments had the bug:
- v1: `0xeB8b60D4daa79fDBfEfe72d75cD1c2A5c65D9445` (only bool parameter)
- v2: `0x7aC69d523c2349db3C738BCf6a30eB02C55ddfcE` (bool + string overloads)
- v3: `0x0842AE3e3cc23F587ADe2198cD681b6AfFF234B4` (only string overload)
- v4: `0xeB7509CC4496C857a3EC2D722d3AA10da419725d` (struct with string - broke cached ABIs)

## Current Deployment (Fixed)

- v5: `0x1F19eFDE526Ab2ef32eF5Db66Cd858D3E5f00B0a` ✅ **SUPPORTS ALL FORMATS**

## Files Modified

1. `contracts/factories/StandardFactory.sol`:
   - Added `DaoParamsLegacy` struct with bool
   - Added `deployDAOwithToken(DaoParamsLegacy)` overload
   - Kept `DaoParams` struct with string
   - All overloads funnel to main function with proper bool conversion

2. `indexer/update_firestore_config.py`:
   - Updated with new deployment addresses

3. `deployments/etherlink-testnet-standard.json`:
   - Contains new deployment info

4. `scripts/testTransferability.js`:
   - New test script to verify the fix

## Testing Results

After deploying and restarting the indexer:

1. ✅ Contract compiles successfully
2. ✅ Deploys to testnet
3. ✅ ABI contains all 3 overloads
4. ✅ Firestore updated with new wrapper
5. ⏳ Pending: End-to-end test from Flutter app
6. ⏳ Pending: Verify token is non-transferable

## Support

If you encounter issues:
1. Check the indexer is running and monitoring the new wrapper
2. Verify Firestore has the correct wrapper address
3. Check transaction hash with `scripts/analyzeTx.js`
4. Test token transferrability directly on contract

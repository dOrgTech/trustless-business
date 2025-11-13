# FINAL SOLUTION: Two Separate Factories

## Problem
We were stuck in a loop trying to make a single factory work with a transferability parameter. Different issues kept appearing:
- JavaScript type coercion: `Boolean("false") === true`
- Cached ABIs in Flutter app
- Parameter confusion between string/bool formats

## Solution
**Two separate factories with NO transferability parameter:**

### 1. StandardFactoryNonTransferable ✅
**Address:** `0xc558cD4e3Fa91C51141ab0E6Cd77b5Fe94B0B002`

- **ALWAYS** creates non-transferable tokens
- No parameters to get wrong
- Guaranteed behavior
- **Use this for your web app**

### 2. StandardFactoryTransferable
**Address:** `0xFBC66A23Fe3dc851817eFDa6A039b599707E0E3b`

- **ALWAYS** creates transferable tokens
- For special use cases only
- Clearly separated functionality

## Test Results

Deployed test DAO using StandardFactoryNonTransferable:
```
✅ Token deployed: 0x40463C07df24Aa7A0599e6143ECCCF3e4E8EA785
✅ isTransferable: false
✅ Transfer attempt: Correctly rejected
```

## Deployment Info

**Network:** Etherlink Testnet (chainId 128123)
**Deployer:** 0x06E5b15Bc39f921e1503073dBb8A5dA2Fc6220E9
**Date:** 2025-11-12

**Shared Infrastructure:**
- InfrastructureFactory: `0x804Ab2A2a0496246A3B75419fC774447F40230ad`
- DAOFactory: `0x8389e45B96433474B7BFE7924F5C909965426261`
- RepTokenFactory: `0x2B5D7DcbA86E089ecA7D406013C8E5bCb45cd65A`

## What Changed in Firestore

```
contracts/Etherlink-Testnet:
  wrapper_jurisdiction: 0xc558cD4e3Fa91C51141ab0E6Cd77b5Fe94B0B002  (NON-TRANSFERABLE)
  wrapper_w:            0xFBC66A23Fe3dc851817eFDa6A039b599707E0E3b  (TRANSFERABLE)
```

## Next Steps for You

### 1. Update Your Web App
Change the wrapper address to the **NON-TRANSFERABLE factory**:
```dart
final wrapperAddress = "0xc558cD4e3Fa91C51141ab0E6Cd77b5Fe94B0B002";
```

**Remove the transferability parameter** from your function calls - it's no longer needed!

### 2. Restart the Indexer
On your production server:
```bash
sudo systemctl restart indexer@testnet
sudo journalctl -u indexer@testnet -f
```

### 3. Test It
1. Deploy a DAO from your Flutter app using the new wrapper
2. After deployment, import the token in Metamask
3. Try to transfer tokens
4. **It should fail** with "Reputation is non-transferable"

## Benefits of This Approach

✅ **No parameter confusion** - behavior is determined by which contract you call
✅ **No type coercion issues** - no parameters to parse
✅ **No cached ABI problems** - contract behavior is in the address, not parameters
✅ **Clear and explicit** - developers know exactly what they're getting
✅ **Future-proof** - new apps don't need to worry about compatibility

## Function Signature

Both factories have the same interface (just different behavior):

```solidity
// Using struct
function deployDAOwithToken(DaoParams memory params) public payable

// Using individual parameters (backward compatible)
function deployDAOwithToken(
    string memory name,
    string memory symbol,
    string memory description,
    uint8 decimals,
    uint256 executionDelay,
    address[] memory initialMembers,
    uint256[] memory initialAmounts,
    string[] memory keys,
    string[] memory values
) public payable
```

**NO transferability parameter in either version!**

## Contract Source

Both contracts are in:
- `contracts/factories/StandardFactoryNonTransferable.sol`
- `contracts/factories/StandardFactoryTransferable.sol`

## Scripts

- Deploy: `scripts/deployBothFactories.js`
- Test: `scripts/testNonTransferable.js`
- Update Firestore: `indexer/update_firestore_both_wrappers.py`

## Summary

This solution breaks us out of the parameter-confusion loop by **eliminating the parameter entirely**. Instead of trying to make one factory interpret a parameter correctly across different languages and cached ABIs, we have two factories with clear, unchangeable behavior.

Your web app just needs to use the right address - that's it!

# DAO Governance System

The Homebase DAO system provides on-chain governance using OpenZeppelin's Governor framework with custom extensions for reputation-based voting.

## Architecture Overview

```
HomebaseDAO (Governor)
    ↓ controls
TimelockController (Execution Delay + Security)
    ↓ manages
Registry (Treasury + Configuration Store)
    ↓ linked to
RepToken (ERC20Votes Governance Token)
```

## Core Contracts

### HomebaseDAO (`Dao.sol`)

A composite Governor implementation that manages the voting lifecycle for on-chain proposals.

**Extensions:**
- `GovernorSettings` - Configurable voting parameters
- `GovernorCountingSimple` - For/Against/Abstain voting
- `GovernorVotes` - Token-based voting power
- `GovernorVotesQuorumFraction` - Percentage-based quorum
- `GovernorTimelockControl` - Timelock integration

**Constructor Parameters:**
- `_token` - Governance token address (RepToken)
- `_timelock` - TimelockController address
- `name` - DAO name
- `minsDelay` - Voting delay in minutes
- `minsVoting` - Voting period in minutes
- `pThreshold` - Minimum tokens to create proposals
- `qvrm` - Quorum percentage (0-100)

### RepToken (`RepToken.sol`)

ERC20Votes governance token with reputation accrual from Economy activity.

**Key Features:**

1. **Transferability Control**
   - Configurable at deployment (`isTransferable`)
   - Non-transferable by default to prevent vote buying
   - Transfer functions revert when disabled

2. **Economy Integration**
   - Links to Economy contract for reputation accrual
   - `claimReputationFromEconomy()` - Mint tokens based on activity
   - Uses parity mappings from Registry for token-to-reputation conversion

3. **Incentive Epochs**
   - **Passive Income Epochs** - Distribute rewards proportional to token holdings
   - **Delegate Reward Epochs** - Compensate delegates for representation
   - Both use timestamp-based snapshots for fair distribution

4. **Admin Functions**
   - `mint(address to, uint256 amount)` - Admin-only minting
   - `burn(address from, uint256 amount)` - Admin-only burning
   - `setAdmin(address newAdmin)` - Transfer admin role
   - `setEconomyAddress(address)` - One-time Economy linking

**Reputation Calculation:**
```solidity
function _calculateReputation(address token, uint amount) internal view returns (uint256) {
    // Reads "jurisdiction.parity.<tokenAddress>" from Registry
    // Returns: amount * parity (or 0 if no parity set)
}
```

### Registry (`Registry.sol`)

Treasury and configuration management with ERC721 support.

**Treasury Functions:**
- `receive()` - Accept ETH
- `onERC721Received()` - Accept NFTs
- `transferETH(address payable to, uint256 amount)` - Send ETH
- `transferERC20(address token, address to, uint256 amount)` - Send ERC20
- `transferERC721(address token, address to, uint256 tokenId)` - Send NFT

**Configuration Store:**
- `editRegistry(string key, string value)` - Set single key
- `batchEditRegistry(string[] keys, string[] values)` - Set multiple keys
- `getRegistryValue(string key)` - Read value
- `getAllKeys()` / `getAllValues()` - Enumerate all

**Earmarking System:**
- `earmarkFunds(bytes32 purpose, uint256 amount, address token)` - Reserve funds
- `withdrawEarmarkedFunds(bytes32 purpose, uint256 amount)` - Release reservation
- `disburseEarmarked(address recipient, uint256 amount, bytes32 purpose, address token)` - Pay from earmark
- `reclaimEarmarkedFunds(uint256 epochId, address token, bool isDelegateReward)` - Reclaim expired epochs

**Access Control:**
- Treasury operations: Owner only (Timelock)
- Registry edits: Owner or Wrapper

### TimelockController

OpenZeppelin's standard timelock that enforces execution delays on all governance actions.

**Roles:**
- `PROPOSER_ROLE` - Granted to DAO contract
- `EXECUTOR_ROLE` - Granted to address(0) (anyone can execute)
- `DEFAULT_ADMIN_ROLE` - Revoked from factory after setup

## Proposal Lifecycle

1. **Delegation** (Required)
   ```solidity
   repToken.delegate(myAddress); // Self-delegate to activate voting power
   ```

2. **Proposal Creation**
   ```solidity
   dao.propose(
       [targetAddress],      // Contracts to call
       [0],                  // ETH values
       [calldata],           // Encoded function calls
       "Description"
   );
   ```

3. **Voting Delay**
   - Configurable waiting period before voting opens
   - Allows members to acquire/delegate tokens

4. **Voting Period**
   ```solidity
   dao.castVote(proposalId, 1); // 0=Against, 1=For, 2=Abstain
   ```

5. **Queue** (if passed)
   ```solidity
   dao.queue(targets, values, calldatas, descriptionHash);
   ```

6. **Execution Delay**
   - Timelock enforces configured delay
   - Security window for members to react

7. **Execute**
   ```solidity
   dao.execute(targets, values, calldatas, descriptionHash);
   ```

## Proposal States

```
Pending   → Active    → Succeeded → Queued     → Executed
    ↓          ↓           ↓           ↓
Canceled  Defeated    Expired    Canceled
```

## Wrapped Token Governance

For DAOs that want to use an existing ERC20 as the governance token:

### WrappedRepToken (`WrappedRepToken.sol`)

Wraps any ERC20 into a governance token using OpenZeppelin's `ERC20Wrapper`.

**How it works:**
1. Users deposit underlying tokens via `depositFor()`
2. Receive 1:1 wrapped governance tokens
3. Can withdraw via `withdrawTo()`
4. Wrapped tokens have ERC20Votes functionality

**Transferability:**
- Configured at deployment
- Controls wrapped token only (underlying is always transferable)
- Non-transferable adds friction to vote markets

## Security Considerations

1. **Vote Buying Prevention**
   - Non-transferable tokens by default
   - Users must unwrap → transfer underlying → recipient wraps to sell votes

2. **Flash Loan Protection**
   - Voting power snapshots at proposal creation block
   - Cannot acquire tokens and vote in same block

3. **Timelock Security**
   - All governance actions have execution delay
   - Community can react to malicious proposals

4. **Reentrancy Protection**
   - Registry uses `ReentrancyGuard` on transfers

## Common Registry Keys

| Key | Purpose |
|-----|---------|
| `jurisdiction.parity.<tokenAddr>` | Token to reputation conversion rate |
| `benefits.claim.gracePeriod` | Time before unclaimed epoch funds can be reclaimed |
| `dao.website` | DAO website URL |
| `dao.description` | DAO description |

## Example: Creating a Proposal to Mint Tokens

```solidity
// Encode the mint call
bytes memory calldata = abi.encodeWithSignature(
    "mint(address,uint256)",
    recipientAddress,
    1000 * 10**18
);

// Create proposal
uint256 proposalId = dao.propose(
    [repTokenAddress],
    [0],
    [calldata],
    "Mint 1000 tokens to contributor"
);

// After voting delay, members vote
// After voting period ends, if passed:
dao.queue([repTokenAddress], [0], [calldata], descriptionHash);

// After timelock delay:
dao.execute([repTokenAddress], [0], [calldata], descriptionHash);
```

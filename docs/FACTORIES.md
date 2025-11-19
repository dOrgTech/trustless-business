# Factory Contracts

The factory system enables one-transaction deployment of complete DAO infrastructures. Different factories support different use cases.

## Factory Types

| Factory | Use Case | Token Type | Economy |
|---------|----------|------------|---------|
| `StandardFactory` | Standard DAO governance | Non-transferable RepToken | No |
| `StandardFactoryTransferable` | Transferable governance | Transferable RepToken | No |
| `StandardFactoryWrapped` | Wrap existing ERC20 | WrappedRepToken | No |
| `TrustlessFactory` | Economy DAO with marketplace | Non-transferable RepToken | Yes |

## StandardFactory

Deploys standard DAOs with native governance tokens.

### Contract Address (Etherlink Testnet)
```
StandardFactory: 0xeB7509CC4496C857a3EC2D722d3AA10da419725d
```

### Deployment Function

```solidity
struct DaoParams {
    string name;
    string symbol;
    string description;
    uint8 decimals;
    uint256 executionDelay;
    address[] initialMembers;
    uint256[] initialAmounts;  // Token amounts + 4 governance params
    string[] keys;
    string[] values;
}

function deployDAOwithToken(DaoParams memory params) public payable;
```

### Parameter Encoding

The `initialAmounts` array contains both token distributions and governance parameters:

```
[
    tokenAmount1,      // For initialMembers[0]
    tokenAmount2,      // For initialMembers[1]
    ...
    votingDelay,       // Minutes before voting starts
    votingPeriod,      // Minutes for voting
    proposalThreshold, // Tokens needed to propose
    quorumFraction     // Percentage (0-100)
]
```

### Legacy Function Signature

For backwards compatibility with existing web apps:

```solidity
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
) public payable;
```

### What Gets Deployed

1. **TimelockController** - Execution delay for proposals
2. **Registry** - Treasury and configuration
3. **RepToken** - Non-transferable governance token
4. **HomebaseDAO** - Governor contract

### Ownership Flow

```
Factory deploys all contracts as temporary admin
    ↓
Factory configures relationships
    ↓
Factory transfers ownership to Timelock
    ↓
Factory revokes its own admin role
```

### Event

```solidity
event NewDaoCreated(
    address indexed dao,
    address token,
    address[] initialMembers,
    uint256[] initialAmounts,
    string name,
    string symbol,
    string description,
    uint256 executionDelay,
    address registry,
    string[] keys,
    string[] values
);
```

## StandardFactoryTransferable

Same as StandardFactory but creates transferable governance tokens.

**Use when:**
- Token liquidity is desired
- Governance power should be tradeable
- Staking/farming mechanisms needed

## StandardFactoryWrapped

Deploys DAOs that wrap existing ERC20 tokens for governance.

### Deployment Function

```solidity
struct DaoParamsWrapped {
    string name;
    string symbol;
    string description;
    uint256 executionDelay;
    address underlyingTokenAddress;
    uint256[] governanceSettings; // [votingDelay, votingPeriod, proposalThreshold, quorumFraction]
    string[] keys;
    string[] values;
    string transferrableStr;      // "true" or "false"
}

function deployDAOwithWrappedToken(DaoParamsWrapped memory params) public payable;
```

### Transferability for Wrapped Tokens

The `transferrableStr` parameter controls whether the **wrapped token** (not the underlying) can be transferred:

**Non-Transferable (`"false"`):**
- Users deposit underlying → receive wrapped
- Users withdraw wrapped → get underlying back
- Cannot transfer wrapped tokens between addresses
- Prevents direct vote buying

**Transferable (`"true"`):**
- Full ERC20 functionality for wrapped tokens
- Enables secondary markets
- Allows staking/farming of wrapped governance

**Important:** The underlying token is always transferable per its own rules. Non-transferable wrapped tokens only add friction to vote markets.

### Event

```solidity
event DaoWrappedDeploymentInfo(
    address indexed daoAddress,
    address indexed wrappedTokenAddress,
    address indexed underlyingTokenAddress,
    address registryAddress,
    string daoName,
    string wrappedTokenSymbol,
    string description,
    uint8 quorumFraction,
    uint256 executionDelay,
    uint48 votingDelay,
    uint32 votingPeriod,
    uint256 proposalThreshold
);
```

## TrustlessFactory

Deploys complete Economy DAOs with marketplace functionality.

### Multi-Step Deployment

Unlike StandardFactory, TrustlessFactory uses a 3-step deployment for flexibility:

```solidity
// Step 1: Deploy infrastructure
factory.deployInfrastructure(timelockDelayInMinutes);

// Step 2: Deploy DAO and token
factory.deployDAOToken(
    registryAddr,
    timelockAddr,
    tokenParams,
    govParams
);

// Step 3: Configure and finalize
factory.configureAndFinalize(
    addressParams,
    economyParams
);
```

### Parameter Structs

```solidity
struct TokenParams {
    string name;
    string symbol;
    address[] initialMembers;
    uint256[] initialAmounts;
}

struct GovParams {
    string name;
    uint48 timelockDelay;
    uint32 votingPeriod;
    uint256 proposalThreshold;
    uint8 quorumFraction;
}

struct AddressParams {
    address[2] implAddresses;     // [nativeProjectImpl, erc20ProjectImpl]
    address[5] contractAddresses; // [economy, registry, timelock, repToken, dao]
}

struct EconomyParams {
    uint initialPlatformFeeBps;
    uint initialAuthorFeeBps;
    uint initialCoolingOffPeriod;
    uint initialBackersQuorumBps;
    uint initialProjectThreshold;
    uint initialAppealPeriod;
}
```

### What Gets Deployed

1. **Economy** - Marketplace contract
2. **TimelockController** - Execution delay
3. **Registry** - Treasury and configuration
4. **RepToken** - Non-transferable governance token
5. **HomebaseDAO** - Governor contract

### Configuration Flow

```
Step 1: Deploy Economy, Timelock, Registry
    ↓
Step 2: Deploy RepToken and DAO
    ↓
Step 3: Configure Economy parameters
        Link RepToken ↔ Economy
        Set project implementations
        Transfer all ownership to Timelock
```

### Events

```solidity
event InfrastructureDeployed(address economy, address registry, address timelock);
event DAOTokenDeployed(address repToken, address dao);
event SuiteConfigured(
    address deployer,
    address indexed economy,
    address registry,
    address timelock,
    address indexed repToken,
    address indexed dao
);
event NewDaoCreated(...); // Same as StandardFactory for indexer compatibility
```

## Sub-Factories

The main factories use specialized sub-factories for modularity:

### InfrastructureFactory

Deploys Timelock and Registry contracts.

```solidity
function deployTimelock(address admin, uint256 delay) external returns (address);
function deployRegistry(address owner, address wrapper) external returns (address);
```

### DAOFactory

Deploys HomebaseDAO Governor contracts.

```solidity
function deployDAO(
    address token,
    address timelock,
    string memory name,
    uint[] memory settings // [votingDelay, votingPeriod, proposalThreshold, quorumFraction]
) external returns (address);
```

### RepTokenFactory

Deploys RepToken governance tokens.

```solidity
function deployRepToken(
    string memory name,
    string memory symbol,
    address payable registry,
    address timelock,
    address[] memory initialMembers,
    uint256[] memory initialAmounts,
    bool transferrable
) external returns (address);
```

### EconomyFactory

Deploys Economy marketplace contracts.

```solidity
function deployEconomy() external returns (address);
```

### WrappedRepTokenFactory

Deploys WrappedRepToken contracts.

```solidity
function deployWrappedRepToken(
    IERC20 underlyingToken,
    string memory name,
    string memory symbol,
    bool transferrable
) external returns (address);
```

## Deployment Example

### Standard DAO

```javascript
const params = {
    name: "My DAO",
    symbol: "MDAO",
    description: "A governance DAO",
    decimals: 18,
    executionDelay: 60, // 1 minute
    initialMembers: [deployer.address],
    initialAmounts: [
        ethers.parseEther("1000"), // 1000 tokens to deployer
        1,  // votingDelay: 1 minute
        5,  // votingPeriod: 5 minutes
        0,  // proposalThreshold: 0 tokens
        10  // quorumFraction: 10%
    ],
    keys: [],
    values: []
};

const tx = await standardFactory.deployDAOwithToken(params);
const receipt = await tx.wait();

// Parse NewDaoCreated event
const event = receipt.logs.find(log =>
    log.topics[0] === standardFactory.interface.getEventTopic('NewDaoCreated')
);
const decoded = standardFactory.interface.parseLog(event);
const daoAddress = decoded.args.dao;
```

### Economy DAO

```javascript
// Step 1
let tx = await trustlessFactory.deployInfrastructure(1); // 1 minute timelock
let receipt = await tx.wait();
const infraEvent = parseEvent(receipt, 'InfrastructureDeployed');

// Step 2
const tokenParams = {
    name: "Economy DAO",
    symbol: "EDAO",
    initialMembers: [deployer.address],
    initialAmounts: [ethers.parseEther("1000")]
};
const govParams = {
    name: "Economy DAO",
    timelockDelay: 1,
    votingPeriod: 5,
    proposalThreshold: 0,
    quorumFraction: 10
};
tx = await trustlessFactory.deployDAOToken(
    infraEvent.registry,
    infraEvent.timelock,
    tokenParams,
    govParams
);
const daoEvent = parseEvent(await tx.wait(), 'DAOTokenDeployed');

// Step 3
const addressParams = {
    implAddresses: [nativeProjectImpl, erc20ProjectImpl],
    contractAddresses: [
        infraEvent.economy,
        infraEvent.registry,
        infraEvent.timelock,
        daoEvent.repToken,
        daoEvent.dao
    ]
};
const economyParams = {
    initialPlatformFeeBps: 100,
    initialAuthorFeeBps: 100,
    initialCoolingOffPeriod: 120,
    initialBackersQuorumBps: 7000,
    initialProjectThreshold: 0,
    initialAppealPeriod: 604800
};
await trustlessFactory.configureAndFinalize(addressParams, economyParams);
```

## Indexer Integration

All factories emit events compatible with the Homebase indexer:

- `NewDaoCreated` - Standard DAO deployment
- `DaoWrappedDeploymentInfo` - Wrapped token DAO deployment

The indexer monitors these events to track deployed DAOs in Firestore.

# Architecture

This document describes the high-level system design of On-Chain Jurisdiction, including contract relationships, deployment patterns, and data flow.

## System Overview

On-Chain Jurisdiction consists of two integrated systems:

1. **DAO Governance** - Token-based voting and treasury management
2. **Trustless Economy** - Escrow-based marketplace with dispute resolution

Both systems share a common governance token (RepToken), creating a feedback loop where economic activity generates governance power.

## Contract Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FACTORY LAYER                                   │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ StandardFactory  │  │ TrustlessFactory │  │ StandardFactoryWrapped   │   │
│  │ (DAO only)       │  │ (DAO + Economy)  │  │ (Wrapped token DAO)      │   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────────┬─────────────┘   │
│           │                     │                          │                 │
│           └─────────────────────┴──────────────────────────┘                 │
│                                 │                                            │
│                    ┌────────────┴────────────┐                               │
│                    │      SUB-FACTORIES      │                               │
│                    │                         │                               │
│                    │  • InfrastructureFactory│                               │
│                    │  • DAOFactory           │                               │
│                    │  • RepTokenFactory      │                               │
│                    │  • EconomyFactory       │                               │
│                    │  • WrappedRepTokenFactory                               │
│                    └────────────┬────────────┘                               │
└─────────────────────────────────┼────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GOVERNANCE LAYER                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         HomebaseDAO                                  │    │
│  │                      (Governor Contract)                             │    │
│  │                                                                      │    │
│  │  Inherits from OpenZeppelin:                                         │    │
│  │  • Governor                    • GovernorVotes                       │    │
│  │  • GovernorSettings            • GovernorVotesQuorumFraction         │    │
│  │  • GovernorCountingSimple      • GovernorTimelockControl             │    │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     │                                        │
│               ┌─────────────────────┼─────────────────────┐                  │
│               │                     │                     │                  │
│               ▼                     ▼                     ▼                  │
│  ┌────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐   │
│  │ TimelockController │  │      RepToken       │  │      Registry       │   │
│  │                    │  │  (Governance Token) │  │     (Treasury)      │   │
│  │ • Execution delay  │  │                     │  │                     │   │
│  │ • Role management  │  │ • ERC20Votes        │  │ • ETH/ERC20/ERC721  │   │
│  │ • Security buffer  │  │ • Reputation claim  │  │ • Config store      │   │
│  └────────────────────┘  │ • Incentive epochs  │  │ • Earmarking        │   │
│                          └──────────┬──────────┘  └─────────────────────┘   │
│                                     │                                        │
└─────────────────────────────────────┼────────────────────────────────────────┘
                                      │
                                      │ (Economy DAOs only)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ECONOMY LAYER                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           Economy                                    │    │
│  │                    (Marketplace Contract)                            │    │
│  │                                                                      │    │
│  │  • Project deployment via clone pattern                              │    │
│  │  • User profile tracking (earnings, spendings, roles)                │    │
│  │  • DAO-controlled parameters (fees, periods, thresholds)             │    │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     │                                        │
│                    ┌────────────────┴────────────────┐                       │
│                    │                                 │                       │
│                    ▼                                 ▼                       │
│       ┌────────────────────────┐       ┌────────────────────────┐           │
│       │     NativeProject      │       │     ERC20Project       │           │
│       │   (ETH/XTZ Escrow)     │       │   (Token Escrow)       │           │
│       │                        │       │                        │           │
│       │ • Multi-stage lifecycle│       │ • Same lifecycle       │           │
│       │ • Backer voting        │       │ • ERC20 handling       │           │
│       │ • Arbitration          │       │ • Token sweeping       │           │
│       │ • DAO appeals          │       │                        │           │
│       └────────────────────────┘       └────────────────────────┘           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Contract Relationships

### Ownership and Control

```
                    ┌─────────────────┐
                    │  TimelockController  │
                    │  (Ultimate Authority)│
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    Registry     │  │    RepToken     │  │    Economy      │
│    (owner)      │  │    (admin)      │  │  (protected)    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                                                   │
                                          ┌────────┴────────┐
                                          ▼                 ▼
                                   ┌────────────┐    ┌────────────┐
                                   │NativeProject│   │ERC20Project│
                                   │(daoTimelock)│   │(daoTimelock)│
                                   └────────────┘    └────────────┘
```

- **TimelockController** owns/controls all other contracts
- **HomebaseDAO** is the only proposer to the Timelock
- **Anyone** can execute queued proposals (executor role granted to address(0))
- **Projects** reference the Timelock for DAO veto and appeal overrides

### Data Flow

```
┌──────────────┐     sendFunds()      ┌──────────────┐
│    Backer    │─────────────────────►│   Project    │
└──────────────┘                      │   Contract   │
                                      └──────┬───────┘
                                             │
                  ┌──────────────────────────┼──────────────────────────┐
                  │                          │                          │
                  ▼                          ▼                          ▼
       updateEarnings()           updateSpendings()          Platform fees
                  │                          │                          │
                  ▼                          ▼                          ▼
         ┌────────────────────────────────────────────────────┐   ┌──────────┐
         │                     Economy                         │   │ Registry │
         │                                                     │   │(Treasury)│
         │  earnings[user][token] += amount                    │   └──────────┘
         │  spendings[user][token] += amount                   │
         └─────────────────────────┬───────────────────────────┘
                                   │
                                   │ claimReputationFromEconomy()
                                   ▼
                          ┌────────────────┐
                          │    RepToken    │
                          │                │
                          │  _mint(user,   │
                          │   reputation)  │
                          └────────┬───────┘
                                   │
                                   │ delegate()
                                   ▼
                          ┌────────────────┐
                          │  HomebaseDAO   │
                          │                │
                          │  Voting power  │
                          │  active        │
                          └────────────────┘
```

## Deployment Patterns

### Standard DAO Deployment

The StandardFactory deploys a complete DAO in a single transaction:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      StandardFactory.deployDAOwithToken()               │
└────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│InfrastructureFactory│  │  RepTokenFactory  │   │    DAOFactory     │
│                     │  │                   │    │                   │
│ deployTimelock()    │  │ deployRepToken()  │   │   deployDAO()     │
│ deployRegistry()    │  │                   │    │                   │
└───────────┬─────────┘  └────────┬──────────┘    └────────┬──────────┘
            │                     │                        │
            ▼                     ▼                        ▼
     TimelockController      RepToken                 HomebaseDAO
     Registry
                                    │
                                    ▼
                    ┌───────────────────────────────────┐
                    │    _finalizeDeployment()          │
                    │                                   │
                    │ 1. Set Registry.jurisdictionAddr  │
                    │ 2. Transfer RepToken.admin        │
                    │ 3. Transfer Registry.owner        │
                    │ 4. Grant Timelock roles           │
                    │ 5. Revoke factory admin           │
                    └───────────────────────────────────┘
```

### Economy DAO Deployment

The TrustlessFactory uses a 3-step deployment for flexibility:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    STEP 1: deployInfrastructure()                        │
│                                                                          │
│    ┌────────────────┐   ┌────────────────┐   ┌────────────────┐         │
│    │ EconomyFactory │   │InfrastructureF.│   │InfrastructureF.│         │
│    │ deployEconomy()│   │ deployTimelock │   │ deployRegistry │         │
│    └───────┬────────┘   └───────┬────────┘   └───────┬────────┘         │
│            ▼                    ▼                    ▼                   │
│         Economy           Timelock              Registry                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    STEP 2: deployDAOToken()                              │
│                                                                          │
│    ┌─────────────────┐                    ┌─────────────────┐            │
│    │RepTokenFactory  │                    │   DAOFactory    │            │
│    │deployRepToken() │                    │   deployDAO()   │            │
│    └────────┬────────┘                    └────────┬────────┘            │
│             ▼                                      ▼                     │
│          RepToken                             HomebaseDAO                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    STEP 3: configureAndFinalize()                        │
│                                                                          │
│    1. Set Economy implementations (NativeProject, ERC20Project)          │
│    2. Configure Economy parameters (fees, periods, thresholds)           │
│    3. Link RepToken ↔ Economy                                            │
│    4. Set Registry.jurisdictionAddress                                   │
│    5. Set Economy.daoAddresses                                           │
│    6. Transfer RepToken.admin to Timelock                                │
│    7. Transfer Registry.owner to Timelock                                │
│    8. Configure Timelock roles (DAO as proposer, anyone as executor)     │
│    9. Revoke factory's admin role                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Clone Pattern for Projects

The Economy contract uses OpenZeppelin's [Clones](https://docs.openzeppelin.com/contracts/5.x/api/proxy#Clones) library for gas-efficient project deployment:

```
┌────────────────────────────────────────────────────────────────────────┐
│                           Economy Contract                              │
│                                                                         │
│  nativeProjectImplementation ─────► NativeProject (reference)           │
│  erc20ProjectImplementation ──────► ERC20Project (reference)            │
│                                                                         │
│  createProject():                                                       │
│    clone = Clones.clone(nativeProjectImplementation)                    │
│    NativeProject(clone).initialize(...)                                 │
│                                                                         │
│  createERC20Project():                                                  │
│    clone = Clones.clone(erc20ProjectImplementation)                     │
│    ERC20Project(clone).initialize(...)                                  │
└────────────────────────────────────────────────────────────────────────┘
```

Benefits:
- **Gas efficient**: ~$0.10 per deployment vs ~$2+ for full contract
- **Upgradeable implementations**: New projects use latest logic
- **Consistent interface**: All projects share the same API

## Security Model

### Access Control Matrix

| Action | Who Can Do It | Mechanism |
|--------|---------------|-----------|
| Create proposal | RepToken holders (>= threshold) | Governor.proposalThreshold |
| Vote on proposal | Delegated RepToken holders | Governor.castVote |
| Queue proposal | Anyone (if passed) | Governor.queue |
| Execute proposal | Anyone (after delay) | Timelock.executorRole |
| Transfer treasury | Timelock only | Registry._treasuryOps |
| Edit registry | Timelock or wrapper | Registry._regedit |
| Mint/burn RepToken | Timelock (via admin) | RepToken.admin |
| Create project | RepToken holders (>= threshold) | Economy.projectThreshold |
| Override arbitration | Timelock only | Project.daoOverrule |
| Veto project | Timelock only | Project.daoVeto |

### Timelock as Security Buffer

```
┌──────────────────────────────────────────────────────────────────────┐
│                       PROPOSAL EXECUTION FLOW                         │
│                                                                       │
│  Proposal    ───►    Voting     ───►    Queue     ───►    Execute    │
│  Created           Period             in Timelock        After Delay │
│     │                 │                    │                  │       │
│     │                 │                    │                  │       │
│     ▼                 ▼                    ▼                  ▼       │
│  Block N          Block N+X           Block N+X+Y        Block N+X+Y+Z│
│                                                                       │
│  [─────────────────────── Security Window ───────────────────────]    │
│                                                                       │
│  During this window, users can:                                       │
│  • Review the proposal contents                                       │
│  • Exit the system (sell tokens, withdraw from projects)              │
│  • Coordinate response to malicious proposals                         │
└──────────────────────────────────────────────────────────────────────┘
```

### Snapshot-Based Voting

Voting power is determined at proposal creation time, preventing:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FLASH LOAN ATTACK (PREVENTED)                  │
│                                                                       │
│  ❌ Attacker cannot:                                                  │
│     1. Borrow tokens via flash loan                                   │
│     2. Create/vote on proposal                                        │
│     3. Return tokens                                                  │
│                                                                       │
│  ✓ Because voting power snapshot taken at proposal creation           │
│  ✓ Attacker would need tokens BEFORE proposal exists                  │
└──────────────────────────────────────────────────────────────────────┘
```

## State Management

### RepToken Balance Tracking

RepToken maintains historical balances for snapshot queries:

```solidity
mapping(address => Checkpoints.Trace208) private _balanceHistory;

// On every transfer/mint/burn:
function _update(address from, address to, uint256 value) internal {
    super._update(from, to, value);
    uint48 timestamp = clock();
    if (from != address(0)) {
        _balanceHistory[from].push(timestamp, uint208(balanceOf(from)));
    }
    if (to != address(0)) {
        _balanceHistory[to].push(timestamp, uint208(balanceOf(to)));
    }
}
```

### Economy User Profiles

The Economy contract tracks comprehensive user activity:

```solidity
// Per-user, per-token tracking
mapping(address => mapping(address => uint)) public earnings;
mapping(address => mapping(address => uint)) public spendings;

// Role-based project lists
mapping(address => address[]) public projectsAsAuthor;
mapping(address => address[]) public projectsAsContractor;
mapping(address => address[]) public projectsAsArbiter;
```

## Event-Driven Architecture

All significant state changes emit events for off-chain indexing:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         INDEXED EVENTS                                │
│                                                                       │
│  Factory Layer:                                                       │
│  • NewDaoCreated(dao, token, members, amounts, name, ...)             │
│                                                                       │
│  Governance Layer:                                                    │
│  • ProposalCreated(proposalId, proposer, targets, ...)                │
│  • VoteCast(voter, proposalId, support, weight, reason)               │
│  • ProposalQueued(proposalId, eta)                                    │
│  • ProposalExecuted(proposalId)                                       │
│                                                                       │
│  Economy Layer:                                                       │
│  • NewProject(contractAddress, projectName, contractor, arbiter, ...) │
│  • SendFunds(who, howMuch, immediateBps)                              │
│  • ContractSigned(contractor)                                         │
│  • ProjectDisputed(by)                                                │
│  • ArbitrationDecision(arbiter, percent, rulingHash)                  │
│  • ArbitrationAppealed(appealer, proposalId)                          │
│  • DaoOverruled(timelock, percent, rulingHash)                        │
│  • ProjectClosed(by)                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

## Gas Optimization Strategies

1. **Clone pattern** for project deployment (~$0.10 vs ~$2+)
2. **Batch operations** in factories (single transaction deployment)
3. **Checkpoint compression** using uint208 for balances
4. **Minimal storage** in project contracts (derived values computed on read)
5. **Event-based history** instead of on-chain arrays where possible

## Upgrade Considerations

The system is designed with limited upgradeability:

| Component | Upgradeable? | Mechanism |
|-----------|--------------|-----------|
| Factory contracts | No | Deploy new factory, keep old DAOs |
| HomebaseDAO | No | Deploy new DAO via governance proposal |
| RepToken | No | Migrate via governance (snapshot + new token) |
| Registry | No | Contents modifiable via governance |
| Economy | No | New economy via governance proposal |
| Project implementations | Yes | Economy.setImplementations() |

Project implementations can be upgraded by the DAO, affecting only **new** projects. Existing projects continue using their original implementation.

## Further Reading

- [DAO Governance](dao-governance.md) - Detailed governance mechanics
- [Trustless Economy](economy.md) - Project lifecycle and dispute resolution
- [Technical Reference](technical-reference.md) - Contract API documentation
- [OpenZeppelin Governor](https://docs.openzeppelin.com/contracts/5.x/governance) - Base framework documentation

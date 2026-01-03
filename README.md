# On-Chain Jurisdiction

A framework for autonomous economic coordination through decentralized governance and trustless commerce.

[![UI: werule.io](https://img.shields.io/badge/DAO%20Platform-werule.io-blue)](https://werule.io)
[![UI: trustless.business](https://img.shields.io/badge/Trustless%20Economy-trustless.business-green)](https://trustless.business)

## The Promise of Trustless Coordination

Throughout history, economic progress has depended on systems of trust. Nations built legal frameworks, courts established precedent, and institutions emerged to mediate agreements between strangers. These systems enabled civilization to scale beyond tribal networks where everyone knew everyone else.

But these systems come with costs: bureaucratic overhead, jurisdictional boundaries, access inequality, and the ever-present risk of corruption. What if trust itself could be encoded into the fabric of our agreements?

**On-Chain Jurisdiction** represents a new paradigm: a self-enforcing framework where:
- **Agreements execute automatically** according to predefined terms
- **Disputes resolve through transparent arbitration** with built-in appeals
- **Reputation accrues from real economic activity**, not credentials or social capital
- **Governance power flows to those who contribute**, not those who merely invest

This is not a replacement for traditional systems, but an alternative—one that exists alongside them, available to anyone with internet access and a desire to participate in trustless commerce.

## Two Systems, One Jurisdiction

On-Chain Jurisdiction provides two complementary systems that work together:

### 1. DAO Governance

Decentralized organizations with on-chain voting, treasury management, and transparent decision-making. Built on [OpenZeppelin's Governor framework](https://docs.openzeppelin.com/contracts/5.x/governance), our implementation adds:

- **Reputation Tokens (RepToken)** that can be non-transferable to prevent vote-buying
- **Registry** for treasury management and configuration storage
- **Timelock security** for all governance actions
- **Incentive epochs** for rewarding participation and delegation

**Use cases:**
- Protocol governance
- Treasury management
- Community coordination
- Grant distribution

### 2. Trustless Economy

A marketplace for work where agreements self-enforce through smart contracts. Funds are held in escrow until work is verified, with a multi-layered dispute resolution system:

- **Backer voting** for straightforward releases
- **Third-party arbitration** when parties disagree
- **DAO appeals** as a final safeguard against bad rulings

Economic activity generates reputation, which translates to governance power. The more you contribute to the economy, the more influence you have over its rules.

**Use cases:**
- Freelance work and service agreements
- Crowdfunded projects
- DAO-to-DAO collaboration
- Grant distribution with milestone tracking

## How They Connect

```
┌──────────────────────────────────────────────────────────────────────┐
│                         JURISDICTION                                 │
│                                                                      │
│  ┌─────────────────────┐         ┌─────────────────────────────┐     │
│  │   DAO Governance    │◄───────►│    Trustless Economy        │     │
│  │                     │         │                             │     │
│  │  • Proposals        │ Appeals │  • Projects with escrow     │     │
│  │  • Voting           │◄────────│  • Arbitration              │     │
│  │  • Treasury         │         │  • Reputation tracking      │     │
│  │  • Parameter tuning │────────►│  • Fee collection           │     │
│  └──────────┬──────────┘         └──────────────┬──────────────┘     │
│             │                                    │                   │
│             └──────────────┬─────────────────────┘                   │
│                            │                                         │
│                   ┌────────▼────────┐                                │
│                   │    RepToken     │                                │
│                   │                 │                                │
│                   │ Governance power│                                │
│                   │ from economic   │                                │
│                   │ activity        │                                │
│                   └─────────────────┘                                │
└──────────────────────────────────────────────────────────────────────┘
```

1. **Activity generates reputation**: Complete projects, fund work, or arbitrate disputes → earn RepTokens
2. **Reputation enables governance**: Hold RepTokens → vote on proposals, create proposals, appeal rulings
3. **Governance shapes the economy**: DAO votes set fees, quorums, thresholds, and can override arbitration

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Compile Contracts

```bash
npx hardhat compile
```

### Deploy a DAO

```bash
# Standard DAO (governance only)
npx hardhat run scripts/deployStandardFactory.js --network et

# Economy DAO (governance + marketplace)
npx hardhat run scripts/deployTrustlessFactory.js --network et
```

### Run Tests

```bash
npx hardhat test
```

## Documentation

Detailed documentation is organized into chapters:

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, contract relationships, deployment patterns |
| [DAO Governance](docs/dao-governance.md) | Voting, proposals, RepToken, Registry, OpenZeppelin integration |
| [Trustless Economy](docs/economy.md) | Project lifecycle, escrow, arbitration, dispute resolution |
| [Technical Reference](docs/technical-reference.md) | Contract functions, parameters, events, deployed addresses |

## Contract Overview

### Core Contracts

| Contract | Purpose |
|----------|---------|
| `HomebaseDAO` | Governor contract implementing proposal and voting lifecycle |
| `RepToken` | ERC20Votes governance token with reputation accrual from Economy |
| `Registry` | Treasury (ETH, ERC20, ERC721) and configuration key-value store |
| `TimelockController` | Execution delay for all governance actions |
| `Economy` | Marketplace contract that deploys and tracks projects |
| `NativeProject` | Escrow contract for native currency (ETH/XTZ) projects |
| `ERC20Project` | Escrow contract for ERC20 token projects |

### Factory Contracts

| Factory | Creates | Token Type |
|---------|---------|------------|
| `StandardFactory` | DAO without economy | Non-transferable RepToken |
| `StandardFactoryTransferable` | DAO without economy | Transferable RepToken |
| `StandardFactoryWrapped` | DAO wrapping existing ERC20 | WrappedRepToken |
| `TrustlessFactory` | DAO with economy | Non-transferable RepToken |

## Key Concepts

### Non-Transferable Governance

By default, RepTokens cannot be transferred. This prevents vote-buying and ensures governance power comes from participation, not purchase. Users earn reputation through:

- Completing work as a contractor
- Funding projects as a backer
- Resolving disputes as an arbiter

### Timelock Security

All governance actions pass through a TimelockController with configurable delays. This gives the community time to:

- Review approved proposals before execution
- Exit the system if they disagree with a decision
- Coordinate response to malicious proposals

### Multi-Layer Dispute Resolution

Projects can become contentious. The system provides multiple resolution paths:

1. **Backer consensus**: If 70%+ of backers agree, funds release or dispute
2. **Arbitration**: A designated arbiter rules on the split
3. **DAO appeal**: Any member with sufficient reputation can appeal to governance
4. **Timeout**: If arbiters fail to act, projects auto-close after 150 days

### Immediate Release

Backers can choose to release a portion of their contribution immediately upon contract signing, allowing contractors to access operating capital. The remainder stays in escrow until project completion.

## Deployed Addresses

### Etherlink Testnet

```
StandardFactory:        0xeB7509CC4496C857a3EC2D722d3AA10da419725d
InfrastructureFactory:  0xaAee6c3C383D8f85920977375561fcb7CdA5543b
DAOFactory:             0x72C0413227418e4C1bbA40559c762c15A1417db7
RepTokenFactory:        0x440a296CF621F704ac25F5F27FB3d043F7B95F05
```

## Tech Stack

- **Solidity** ^0.8.24 (compiled with 0.8.26, Cancun EVM)
- **Hardhat** development environment
- **OpenZeppelin Contracts** 5.x

## Security Model

| Threat | Mitigation |
|--------|------------|
| Vote buying | Non-transferable tokens by default |
| Flash loan attacks | Snapshot-based voting power |
| Malicious proposals | Timelock execution delay |
| Bad arbitration | DAO appeal system |
| Reentrancy | ReentrancyGuard on treasury operations |
| Abandoned projects | 150-day arbitration timeout |

## Web Interfaces

- **[werule.io](https://werule.io)** - DAO governance platform
- **[trustless.business](https://trustless.business)** - Trustless Economy marketplace

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Submit a pull request

## License

MIT

## Contact

andrei@dorg.tech

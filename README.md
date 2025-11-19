# Trustless Contracts

On-chain governance and trustless business infrastructure for the Homebase DAO platform.

## Overview

This repository contains smart contracts that enable two complementary systems:

1. **DAO Governance** - Token-based voting, proposals, treasury management
2. **Trustless Economy** - Escrow-based business arrangements with arbitration

Both systems are designed to work together: the Economy generates reputation that translates to governance power in the DAO.

## The Vision

Business arrangements constitute the driving force of our civilization and require a trusted system of incentives. These contracts provide an alternative to traditional frameworks, made possible by decentralized technology.

Since the conceptualization of consensus-driven digital networks, it became obvious that trust can be diffused and encoded within a network, negating the need for centralized intermediaries. Distributed equilibrium logic can now ensure the authenticity and execution integrity of transactions, resulting in self-enforcing agreements.

By supplanting centralized mechanisms with transparent, consensus-driven networks, we open the door to governance models that inherently foster an otherwise elusive level of auditability and fairness, placing decision-making closer to the ground and thus empowering individuals and communities.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUSTLESS FACTORY                         │
│  (One-click deployment of complete DAO + Economy suites)     │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ↓               ↓               ↓
┌─────────────────┐ ┌───────────┐ ┌─────────────────┐
│   HomebaseDAO   │ │  Economy  │ │    Registry     │
│   (Governor)    │ │(Marketplace)│ │   (Treasury)    │
└────────┬────────┘ └─────┬─────┘ └────────┬────────┘
         │                │                │
         └────────────────┼────────────────┘
                          │
                    ┌─────┴─────┐
                    │  RepToken │
                    │(Governance)│
                    └───────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd trustless-contracts
npm install
```

### Compile Contracts

```bash
npx hardhat compile
```

### Deploy

```bash
# Standard DAO (no economy)
npx hardhat run scripts/deployStandardFactory.js --network et

# Economy DAO (with marketplace)
npx hardhat run scripts/deployTrustlessFactory.js --network et
```

## Contract Types

### Standard DAO

A governance-only DAO with:
- Token-based voting (RepToken)
- Proposal lifecycle management
- Treasury via Registry
- Configurable quorum and voting periods

**Use Cases:**
- Protocol governance
- Treasury management
- Community decision-making

### Economy DAO

Everything in a Standard DAO, plus:
- Trustless marketplace (Economy)
- Escrow-based projects
- Arbitration and appeals
- Reputation accrual from activity

**Use Cases:**
- Freelance marketplaces
- DAO-to-DAO collaboration
- Grant distribution
- Service agreements

## Factory Contracts

| Factory | Description | Token Type |
|---------|-------------|------------|
| `StandardFactory` | Standard DAO | Non-transferable |
| `StandardFactoryTransferable` | Standard DAO | Transferable |
| `StandardFactoryWrapped` | Wrap existing ERC20 | Wrapped |
| `TrustlessFactory` | Economy DAO | Non-transferable |

### Deployed Addresses (Etherlink Testnet)

```
StandardFactory: 0xeB7509CC4496C857a3EC2D722d3AA10da419725d
InfrastructureFactory: 0xaAee6c3C383D8f85920977375561fcb7CdA5543b
DAOFactory: 0x72C0413227418e4C1bbA40559c762c15A1417db7
RepTokenFactory: 0x440a296CF621F704ac25F5F27FB3d043F7B95F05
```

## Core Concepts

### Proposal Lifecycle

```
Pending → Active → Succeeded → Queued → Executed
```

1. Member creates proposal
2. Voting delay passes
3. Members vote during voting period
4. If passed, proposal queued in timelock
5. After execution delay, anyone can execute

### Project Lifecycle (Economy)

```
Open → Pending → Ongoing → Dispute → Appealable → Closed
```

1. Author creates project with terms
2. Author funds escrow, sets parties
3. Contractor signs and begins work
4. Backers vote to release or dispute
5. Arbiter resolves disputes
6. DAO can appeal arbiter decisions

### Reputation Flow

```
User completes project → Economy tracks earnings/spendings
                                    ↓
User claims reputation → RepToken mints based on activity
                                    ↓
User delegates votes → Can participate in governance
```

## Documentation

Detailed documentation is available in the `/docs` folder:

- **[DAO.md](docs/DAO.md)** - Governance system, RepToken, Registry, proposals
- **[ECONOMY.md](docs/ECONOMY.md)** - Marketplace, projects, escrow, arbitration
- **[FACTORIES.md](docs/FACTORIES.md)** - Deployment patterns, factory contracts

## Key Features

### Non-Transferable Tokens

By default, governance tokens are non-transferable to prevent vote buying. Users earn reputation through economic activity rather than purchasing it.

### Timelock Security

All governance actions pass through a TimelockController with configurable delays, giving the community time to react to malicious proposals.

### Appeal System

Arbiter decisions can be appealed to the DAO. Any member with sufficient voting power can initiate an appeal by creating a governance proposal.

### Earmarking

The Registry supports earmarking funds for specific purposes (e.g., passive income epochs), with automated disbursement and reclaim mechanisms.

## Development

### Run Tests

```bash
npx hardhat test
```

### Local Testing

```bash
# Start local node
npx hardhat node

# Deploy to localhost
npx hardhat run scripts/deployStandardFactory.js --network localhost
```

### Network Configuration

Networks are defined in `hardhat.config.js`:
- `localhost` - Local Hardhat node
- `et` - Etherlink testnet
- `sepolia` - Ethereum Sepolia testnet

## Tech Stack

- **Language**: Solidity ^0.8.24
- **Framework**: Hardhat
- **Dependencies**: OpenZeppelin Contracts 5.x

## Security Considerations

1. **Vote Buying Prevention** - Non-transferable tokens by default
2. **Flash Loan Protection** - Snapshot-based voting power
3. **Timelock Delays** - All actions have execution delay
4. **Reentrancy Guards** - Protected treasury operations
5. **Appeal Mechanism** - DAO oversight of arbitration

## License

MIT

## Contact

andrei@dorg.tech

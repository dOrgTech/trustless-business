# Trustless Economy System

The Economy system enables trustless business arrangements between parties, with escrow, arbitration, and DAO governance oversight.

## The Wider Context

Business arrangements constitute the driving force of our civilization and require a trusted system of incentives. Historically, national and international economic frameworks have provided this incentive system. The following describes an alternative to these frameworks, made possible by decentralized technology.

Since the conceptualization of consensus-driven digital networks, it became obvious that trust can be diffused and encoded within a network, negating the need for centralized intermediaries. Distributed equilibrium logic can now ensure the authenticity and execution integrity of transactions, resulting in self-enforcing agreements. This not only redefines the transactional trust architecture but also extends to the broader economic sphere, enabling us to engineer a more robust way of organizing business.

## Architecture Overview

```
Economy (Marketplace Contract)
    ↓ deploys via clone pattern
ERC20Project / NativeProject (Escrow + Dispute Resolution)
    ↓ reports activity to
RepToken (Reputation Accrual)
    ↓ governed by
HomebaseDAO
```

## Core Contracts

### Economy (`Economy.sol`)

The central marketplace contract that deploys and tracks projects.

**DAO Governance Links:**
- `timelockAddress` - DAO timelock for protected operations
- `registryAddress` - DAO treasury
- `governorAddress` - DAO governor for appeals
- `repTokenAddress` - Governance token for thresholds

**DAO-Controlled Parameters:**
- `nativeArbitrationFee` - Fee for native currency projects
- `platformFeeBps` - Platform fee (basis points, default 1%)
- `authorFeeBps` - Author fee from successful projects (default 1%)
- `coolingOffPeriod` - Delay before contractor can sign (default 2 minutes)
- `backersVoteQuorumBps` - Quorum for backer votes (default 70%)
- `projectThreshold` - Minimum reputation to create projects
- `appealPeriod` - Time window for appeals (default 7 days)

**User Profile Tracking:**
```solidity
struct UserProfile {
    address[] earnedTokens;      // Tokens earned from projects
    uint[] earnedAmounts;        // Amounts earned per token
    address[] spentTokens;       // Tokens spent on projects
    uint[] spentAmounts;         // Amounts spent per token
    address[] projectsAsAuthor;  // Projects created
    address[] projectsAsContractor; // Projects worked on
    address[] projectsAsArbiter;    // Projects arbitrated
}
```

**Project Deployment:**
```solidity
// Native currency project
createProject(name, contractor, arbiter, termsHash, repo, description);

// ERC20 token project
createERC20Project(name, contractor, arbiter, termsHash, repo, description, tokenAddress, arbitrationFee);
```

### ERC20Project (`ERC20Project.sol`)

Escrow contract for trustless business arrangements using ERC20 tokens.

**Parties:**
- **Author** - Creates the project, typically the client
- **Contractor** - Performs the work, receives payment
- **Arbiter** - Resolves disputes
- **Backers** - Fund the project (may include author)

**Key State Variables:**
- `projectValue` - Total funds in escrow
- `arbitrationFee` - Fee staked by both parties
- `availableToContractor` - Amount claimable after resolution
- `disputeResolution` - Percentage awarded to contractor (0-100)

## Project Lifecycle

### Stage Transitions

```
Open → Pending → Ongoing → Dispute → Appealable → Appeal → Closed
  ↓       ↓         ↓                    ↓
Closed  Closed   Closed              Closed
```

### Stage: Open

Project created without specified parties.

**Available Functions:**
- `sendFunds(uint256 amount)` - Anyone can fund
- `setParties(contractor, arbiter, termsHash)` - Author sets parties
- `withdrawAsContributor()` - Backers can withdraw

### Stage: Pending

Parties are set, awaiting contractor signature.

**Available Functions:**
- `sendFunds(uint256 amount)` - Continue funding
- `signContract()` - Contractor stakes and begins work
- `withdrawAsContributor()` - Backers can withdraw

**Requirements to Sign:**
- `msg.sender == contractor`
- `block.timestamp > coolingOffPeriodEnds`
- `projectValue > 0`
- Contractor transfers `arbitrationFee / 2`

### Stage: Ongoing

Work is in progress.

**Available Functions:**
- `voteToReleasePayment()` - Backer votes to pay contractor
- `voteToDispute()` - Backer votes for dispute
- `disputeAsContractor()` - Contractor initiates dispute
- `reimburse()` - Contractor voluntarily closes project

**Vote Mechanics:**
- Votes weighted by contribution amount
- Can change vote (release ↔ dispute)
- Quorum triggers automatic state transition

### Stage: Dispute

Awaiting arbitration.

**Available Functions:**
- `arbitrate(uint256 percent, string rulingHash)` - Arbiter decides split
- `appeal()` - DAO member appeals to governance
- `arbitrationPeriodExpired()` - Close if arbiter fails (150 days)

### Stage: Appealable

Arbiter has ruled, appeal window open.

**Available Functions:**
- `appeal(proposalId, targets)` - Initiate DAO appeal
- `finalizeArbitration()` - Accept ruling after window

**Appeal Requirements:**
- Caller has `projectThreshold` voting power
- Valid DAO proposal targeting this project
- Within appeal period

### Stage: Appeal

DAO is reviewing the arbitration.

**Available Functions:**
- `daoOverrule(percent, rulingHash)` - Timelock overrides arbiter
- `finalizeArbitration()` - Accept original ruling after window

### Stage: Closed

Project completed or cancelled.

**Available Functions:**
- `withdrawAsContractor()` - Contractor claims payment
- `withdrawAsContributor()` - Backers claim refunds
- `reclaimArbitrationFee()` - Parties reclaim stakes (if no dispute)

## Fee Structure

When contractor withdraws:

```
Payment Flow:
┌─────────────────┐
│  Project Value  │
└────────┬────────┘
         ↓
┌─────────────────┐
│  Platform Fee   │  → Economy contract
│  (1% default)   │
└────────┬────────┘
         ↓
┌─────────────────┐
│   Author Fee    │  → Author address
│  (1% default)   │
└────────┬────────┘
         ↓
┌─────────────────┐
│   Contractor    │  → Contractor address
│    Payment      │
└─────────────────┘
```

## Escrow Mechanics

### Funding
```solidity
function sendFunds(uint256 amount) public {
    // Transfer tokens to project
    token.transferFrom(msg.sender, address(this), amount);

    // Track contribution
    if (contributors[msg.sender] == 0) {
        backers.push(msg.sender);
    }
    contributors[msg.sender] += amount;
    projectValue += amount;
}
```

### Withdrawal (Contributor)
```solidity
function withdrawAsContributor() public {
    uint256 contributorAmount = contributors[msg.sender];

    // Calculate refund based on dispute resolution
    uint256 exitAmount = (contributorAmount * (100 - disputeResolution)) / 100;
    uint256 expenditure = contributorAmount - exitAmount;

    // Track spending for reputation
    if (expenditure > 0) {
        economy.updateSpendings(msg.sender, expenditure, address(token));
    }

    // Return funds
    token.transfer(msg.sender, exitAmount);
}
```

## Arbitration System

### Arbiter Ruling
```solidity
function arbitrate(uint256 percent, string memory rulingHash) public {
    require(msg.sender == arbiter);
    require(stage == Stage.Dispute);
    require(percent <= 100);

    originalDisputeResolution = percent;
    originalRulingHash = rulingHash;
    arbiterHasRuled = true;
    stage = Stage.Appealable;
    appealEnds = block.timestamp + economy.appealPeriod();
}
```

### DAO Appeal Process

1. **Create Proposal** - DAO member creates proposal targeting `daoOverrule()`
2. **Call Appeal** - Link proposal to project
3. **DAO Votes** - Standard governance process
4. **Execute** - Timelock calls `daoOverrule()` or appeal expires

```solidity
function daoOverrule(uint256 percent, string memory rulingHash) public {
    require(msg.sender == daoTimelock);
    require(stage == Stage.Appeal);
    require(block.timestamp <= appealEnds);

    _finalizeDispute(percent, rulingHash);
}
```

### Arbitration Fee Flow

**No Dispute:**
- Both parties reclaim their half via `reclaimArbitrationFee()`

**With Dispute:**
- If arbiter ruled: Fee goes to arbiter
- If arbiter failed (timeout): Fee goes to Economy contract

## DAO Governance Controls

The Economy contract is designed to be governed by its linked DAO:

```solidity
// Only Timelock can modify parameters after initial setup
function setPlatformFee(uint newFeeBps) external {
    require(timelockAddress == address(0) || msg.sender == timelockAddress);
    platformFeeBps = newFeeBps;
}
```

**Governable Parameters:**
- Platform fee percentage
- Author fee percentage
- Cooling off period
- Backer vote quorum
- Project creation threshold
- Appeal period

**DAO Powers:**
- Override arbiter decisions via appeal
- Veto projects via `daoVeto()`
- Sweep orphaned tokens via `sweepOrphanedTokens()`
- Withdraw accumulated fees

## Reputation Integration

Activity in the Economy accrues reputation in the linked RepToken:

```solidity
// In Economy contract
function updateEarnings(address user, uint amount, address tokenAddress) external {
    require(isProjectContract[msg.sender]);
    earnings[user][tokenAddress] += amount;
}

// In RepToken contract
function claimReputationFromEconomy() external {
    UserProfile memory profile = economy.getUser(msg.sender);

    // Calculate reputation from earnings and spendings
    for (uint i = 0; i < profile.earnedTokens.length; i++) {
        uint unclaimedAmount = profile.earnedAmounts[i] - claimedEarnings[msg.sender][token];
        totalReputationToMint += _calculateReputation(token, unclaimedAmount);
    }

    _mint(msg.sender, totalReputationToMint);
}
```

## Security Features

1. **Cooling Off Period** - Delay before contractor can sign
2. **Arbitration Timeout** - 150 days for arbiter to rule
3. **Appeal System** - DAO can override bad arbitration
4. **Contribution Tracking** - Precise accounting of all funds
5. **Orphan Token Sweep** - Recover accidentally sent tokens

## Events

```solidity
event NewProject(address indexed contractAddress, string projectName, ...);
event SetParties(address _contractor, address _arbiter, string _termsHash);
event SendFunds(address who, uint256 howMuch);
event ContractSigned(address contractor);
event ProjectDisputed(address by);
event ArbitrationDecision(address arbiter, uint256 percent, string rulingHash);
event ArbitrationAppealed(address indexed appealer, uint256 indexed proposalId);
event ArbitrationFinalized(address indexed finalizer);
event DaoOverruled(address indexed timelock, uint256 percent, string rulingHash);
event ContractorPaid(address contractor, uint256 amount);
event ContributorWithdrawn(address contributor, uint256 amount);
event ProjectClosed(address by);
```

## Use Cases

1. **Freelance Work** - Client funds project, contractor delivers, automatic payment
2. **Grants** - DAO funds proposal, recipient delivers milestones
3. **Service Agreements** - Ongoing arrangements with dispute protection
4. **Crowdfunded Projects** - Multiple backers, single contractor
5. **DAO-to-DAO Collaboration** - One DAO contracts another

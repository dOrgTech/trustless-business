# Web App Test Plan - Core DAO Features

This test plan covers the basic OpenZeppelin Governor functionality for the Homebase DAO web application. Tests should be performed on Etherlink Testnet.

---

## Prerequisites

- [ ] Wallet connected with test XTZ for gas
- [ ] Access to testnet faucet if needed

---

## 1. DAO Creation

### 1.1 Create DAO with Native Token (Non-Transferable)
- [ ] Fill in DAO name and symbol
- [ ] Set initial members and token amounts
- [ ] Configure governance parameters:
  - Voting delay (minutes)
  - Voting period (minutes)
  - Proposal threshold
  - Quorum percentage
- [ ] Set token as non-transferable
- [ ] Submit transaction and confirm DAO creation
- [ ] Verify DAO appears in dashboard

### 1.2 Create DAO with Native Token (Transferable)
- [ ] Repeat above with transferable token enabled
- [ ] Verify token transfers work between members

### 1.3 Create DAO with Wrapped Token
- [ ] Select existing ERC20 token to wrap
- [ ] Complete DAO creation
- [ ] Verify deposit/withdraw functionality works

---

## 2. Token Delegation

> **Note**: Delegation is REQUIRED before voting. Users cannot vote without delegating first.

### 2.1 Self-Delegation
- [ ] Navigate to delegation UI
- [ ] Select self-delegation option
- [ ] Submit transaction
- [ ] Verify voting power equals token balance

### 2.2 Delegate to Another Address
- [ ] Enter delegate address
- [ ] Submit transaction
- [ ] Verify delegator's voting power is now 0
- [ ] Verify delegate's voting power increased

### 2.3 Change Delegation
- [ ] Change from one delegate to another
- [ ] Verify voting power transfers correctly

### 2.4 Revoke Delegation (Self-Delegate Again)
- [ ] Switch back to self-delegation
- [ ] Verify voting power returns to own balance

---

## 3. Proposal Creation

### 3.1 Transfer ETH Proposal
- [ ] Create proposal to transfer ETH from treasury
- [ ] Set target address, amount, description
- [ ] Submit proposal
- [ ] Verify proposal appears with "Pending" state
- [ ] Verify proposal ID is generated

### 3.2 Transfer ERC20 Proposal
- [ ] Create proposal to transfer ERC20 tokens from treasury
- [ ] Verify calldata is correctly encoded
- [ ] Submit and verify proposal creation

### 3.3 Custom Action Proposal
- [ ] Create proposal with custom contract call
- [ ] Set target, value, calldata, description
- [ ] Verify proposal creation

### 3.4 Multi-Action Proposal
- [ ] Create proposal with multiple actions
- [ ] Verify all actions are bundled correctly

### 3.5 Proposal Threshold Check
- [ ] Attempt to create proposal with insufficient voting power
- [ ] Verify transaction reverts with appropriate error

---

## 4. Voting

### 4.1 Wait for Voting Delay
- [ ] Observe proposal in "Pending" state
- [ ] Wait for voting delay to pass
- [ ] Verify proposal transitions to "Active" state

### 4.2 Cast Vote - For
- [ ] Select "For" vote option
- [ ] Submit vote transaction
- [ ] Verify vote is recorded
- [ ] Verify voting power is counted correctly

### 4.3 Cast Vote - Against
- [ ] On different proposal, vote "Against"
- [ ] Verify vote is recorded

### 4.4 Cast Vote - Abstain
- [ ] On different proposal, vote "Abstain"
- [ ] Verify vote is recorded (counts toward quorum but not result)

### 4.5 Vote with Reason
- [ ] Cast vote with reason string
- [ ] Verify reason is emitted in event

### 4.6 Cannot Vote Twice
- [ ] Attempt to vote again on same proposal
- [ ] Verify transaction reverts

### 4.7 Cannot Vote Without Delegation
- [ ] With undelegated account, attempt to vote
- [ ] Verify vote has 0 weight or reverts

### 4.8 Voting Power Snapshot
- [ ] Receive tokens AFTER proposal creation
- [ ] Attempt to vote
- [ ] Verify new tokens don't count (snapshot at proposal creation)

---

## 5. Proposal Outcomes

### 5.1 Proposal Passes (Quorum Met, Majority For)
- [ ] Create proposal
- [ ] Have sufficient voters vote "For"
- [ ] Wait for voting period to end
- [ ] Verify proposal state is "Succeeded"

### 5.2 Proposal Fails (Majority Against)
- [ ] Create proposal
- [ ] Have majority vote "Against"
- [ ] Verify proposal state is "Defeated"

### 5.3 Proposal Fails (Quorum Not Met)
- [ ] Create proposal
- [ ] Have insufficient participation
- [ ] Verify proposal state is "Defeated"

---

## 6. Queue to Timelock

### 6.1 Queue Successful Proposal
- [ ] With succeeded proposal, click "Queue"
- [ ] Submit transaction
- [ ] Verify proposal state changes to "Queued"
- [ ] Note the execution timestamp

### 6.2 Cannot Queue Failed Proposal
- [ ] Attempt to queue a defeated proposal
- [ ] Verify transaction reverts

### 6.3 Cannot Queue Pending/Active Proposal
- [ ] Attempt to queue before voting ends
- [ ] Verify transaction reverts

---

## 7. Proposal Execution

### 7.1 Wait for Timelock Delay
- [ ] Observe queued proposal
- [ ] Verify execution is blocked before delay passes
- [ ] Wait for timelock delay

### 7.2 Execute Proposal
- [ ] After delay, click "Execute"
- [ ] Submit transaction
- [ ] Verify proposal state changes to "Executed"
- [ ] Verify the proposed action was performed (e.g., ETH transferred)

### 7.3 Cannot Execute Before Delay
- [ ] Attempt to execute immediately after queuing
- [ ] Verify transaction reverts

### 7.4 Proposal Expiration
- [ ] Queue a proposal but don't execute
- [ ] Wait past the grace period
- [ ] Verify proposal state is "Expired"
- [ ] Verify execution now fails

---

## 8. Treasury Operations

### 8.1 Deposit ETH to Treasury
- [ ] Send ETH directly to Registry address
- [ ] Verify balance updates in UI

### 8.2 Deposit ERC20 to Treasury
- [ ] Transfer ERC20 tokens to Registry
- [ ] Verify token balance shows in treasury

### 8.3 Withdraw via Proposal (ETH)
- [ ] Create, vote, queue, execute ETH transfer proposal
- [ ] Verify recipient receives ETH
- [ ] Verify treasury balance decreases

### 8.4 Withdraw via Proposal (ERC20)
- [ ] Create, vote, queue, execute ERC20 transfer proposal
- [ ] Verify recipient receives tokens

---

## 9. Governance Parameter Changes

### 9.1 Update Voting Delay
- [ ] Create proposal to call `setVotingDelay()`
- [ ] Execute proposal
- [ ] Verify new voting delay applies to subsequent proposals

### 9.2 Update Voting Period
- [ ] Create proposal to call `setVotingPeriod()`
- [ ] Execute proposal
- [ ] Verify new voting period applies

### 9.3 Update Proposal Threshold
- [ ] Create proposal to call `setProposalThreshold()`
- [ ] Execute proposal
- [ ] Verify new threshold applies

### 9.4 Update Quorum
- [ ] Create proposal to update quorum numerator
- [ ] Execute proposal
- [ ] Verify new quorum applies

---

## 10. Token Operations (Native RepToken)

### 10.1 Mint Tokens via Proposal
- [ ] Create proposal to call `mint(address, amount)`
- [ ] Execute proposal
- [ ] Verify recipient receives new tokens
- [ ] Verify total supply increases

### 10.2 Burn Tokens via Proposal
- [ ] Create proposal to call `burn(address, amount)`
- [ ] Execute proposal
- [ ] Verify tokens are burned
- [ ] Verify total supply decreases

### 10.3 Transfer Restriction (Non-Transferable)
- [ ] With non-transferable token, attempt transfer
- [ ] Verify transaction reverts

### 10.4 Transfer Allowed (Transferable)
- [ ] With transferable token, perform transfer
- [ ] Verify transfer succeeds

---

## 11. Wrapped Token Operations

### 11.1 Deposit Underlying Token
- [ ] Approve WrappedRepToken to spend underlying
- [ ] Call deposit function
- [ ] Verify wrapped tokens received 1:1

### 11.2 Withdraw to Underlying
- [ ] Call withdraw function
- [ ] Verify underlying tokens returned 1:1
- [ ] Verify wrapped tokens burned

### 11.3 Voting with Wrapped Tokens
- [ ] Delegate wrapped tokens
- [ ] Create and vote on proposal
- [ ] Verify voting power works correctly

### 11.4 No Direct Mint/Burn
- [ ] Verify UI does not offer mint/burn for wrapped token DAOs
- [ ] (Wrapped tokens should only be created/destroyed via deposit/withdraw)

---

## 12. Edge Cases

### 12.1 Zero Value Proposal
- [ ] Create proposal with 0 ETH transfer
- [ ] Verify it can still execute (for contract calls)

### 12.2 Proposal to Self
- [ ] Create proposal targeting the DAO's own contracts
- [ ] Verify execution works

### 12.3 Duplicate Proposal
- [ ] Create identical proposal (same targets, values, calldatas, description)
- [ ] Verify it gets different proposal ID (due to description hash)

### 12.4 Cancel Proposal (if implemented)
- [ ] Proposer cancels their own proposal
- [ ] Verify state changes to "Canceled"

---

## Test Results Summary

| Section | Pass | Fail | Blocked | Notes |
|---------|------|------|---------|-------|
| 1. DAO Creation | | | | |
| 2. Token Delegation | | | | |
| 3. Proposal Creation | | | | |
| 4. Voting | | | | |
| 5. Proposal Outcomes | | | | |
| 6. Queue to Timelock | | | | |
| 7. Proposal Execution | | | | |
| 8. Treasury Operations | | | | |
| 9. Governance Parameters | | | | |
| 10. Token Operations | | | | |
| 11. Wrapped Token Ops | | | | |
| 12. Edge Cases | | | | |

---

## Notes

- All times are in minutes for voting delay/period
- Timelock delay is typically set during DAO creation
- Block snapshots use timestamps (`mode=timestamp`)
- Registry holds all treasury assets

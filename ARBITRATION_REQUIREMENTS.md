# Arbitration Fund Distribution Requirements

## Overview

This document describes the correct fund distribution logic for trustless economy projects when disputes occur.

## Two Separate Pools

### 1. Backer Pool
- `totalLocked` = sum of all backers' locked contributions
- Calculated as: `totalFunding - totalImmediate`
- This is what's at stake in the escrow

### 2. Contractor Stake
- Equals `arbitrationFee / 2`
- Deposited by contractor at signing
- Separate from backer pool - not part of distributable funds

## Arbitration Fee Calculation

- `arbitrationFee = totalLocked * arbitrationFeeBps / 10000`
- Calculated at signing time
- Based on locked value only (immediate release not included)

## Fund Flows

### At Signing
1. Contractor deposits stake (`arbitrationFee / 2`)
2. Immediate funds released to contractor (if any)
3. `totalLocked` remains in escrow

### If No Dispute (Release Vote or Reimburse)
1. Contractor reclaims their stake
2. If release vote: contractor gets `totalLocked` (minus platform/author fees)
3. If reimburse: backers get `totalLocked` back (proportional to locked amounts)
4. Backers' half of arb fee is never deducted (no dispute occurred)

### If Dispute (Arbiter Rules X% to Contractor)

**Arbiter Payment:**
- Arbiter receives full `arbitrationFee`
- Half from contractor's stake
- Half from backer pool

**Distributable Pool (after arbiter paid):**
- `pool = totalLocked - (arbitrationFee / 2)`
- This is what's left after backers' half of arb fee is deducted

**Contractor Entitlement:**
- Gets `X%` of the pool
- Platform fee and author fee calculated from this amount
- Contractor receives: `(pool * X / 100) - platformFee - authorFee`

**Backer Refunds:**
- Each backer gets their proportional share of `(100 - X)%` of the pool
- Proportion based on `backerLockedAmount / totalLocked`
- Refunds are fee-free (no platform/author cut)
- Exit amount = `(pool * (100 - X) / 100) * backerLocked / totalLocked`

**Contractor Stake:**
- Forfeited to arbiter (part of arbitration fee)
- Contractor cannot reclaim after dispute

## Key Invariant

After all withdrawals, project balance must equal zero:
```
arbiterPaid + contractorWithdrawn + sum(backerWithdrawals) + platformFee + authorFee
= totalLocked + contractorStake
```

## Important Notes

1. `immediateReleased` is NOT part of the dispute distribution pool - it was already sent at signing
2. Backer proportions use `lockedAmount / totalLocked`, not `totalContribution / projectValue`
3. Only contractor's share incurs platform/author fees, not backer refunds
4. If arbiter rules 0% to contractor, backers get full `pool` back (minus their arb fee contribution)
5. If arbiter rules 100% to contractor, contractor gets full `pool` (minus platform/author fees)

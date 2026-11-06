# Contract safety measurements

Local Foundry 1.7.1, Solidity 0.8.28, optimizer enabled with 200 runs,
OpenZeppelin 5.6.1. These are mock-token fixture measurements, not live Arc fees.

`CampaignSafetyTest.test_BuyAccessCostDoesNotGrowWithOneHundredBackers` measured
100,224 gas for the `buyAccess` call with one backer and 100,224 gas with 100
backers, in the same prepared fixture. The test permits a 20,000-gas variance
and fails if purchase cost grows with the funder population. Setup and approvals
are outside the measured region; storage warmness reflects the shared test call.

Reproduce from the repository root:

```sh
npm run contracts:test -- --match-test test_BuyAccessCostDoesNotGrowWithOneHundredBackers -vv
```

The invariant handler is the only targeted contract and `step` is the only
targeted selector. The recorded run used 128 runs × 64 calls = 8,192 calls with
zero handler reverts. It covers funding, refunds, production, disputes, release,
purchases, claims, time advancement, and separately tracked donations. Expected
invalid actions are ignored inside the handler. Dedicated tests independently
check principal refunds, cumulative revenue, expiry/cap boundaries, reentrancy,
rounding, and cancellation/refund order.

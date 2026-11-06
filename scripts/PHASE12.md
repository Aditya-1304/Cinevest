# Phase 12 extensions

These changes require a newly deployed factory and campaigns; existing deployments cannot be upgraded.
The generated deployment compatibility flag remains false until deployment is verified.
No live acceptance or funded-wallet transaction is implied by local compilation.

## Verified first round (12.1)

Create through `CampaignFactory.createCampaignWithVerifiedRound(terms, N)`, with
`worldGated=true` and a positive `perHumanLimit`. The existing verifier must be configured.
The ordinary creation method preserves its existing behavior.
Only successful, nonzero authorized contributions from previously unseen campaign-scoped
nullifiers count toward N. Once N is reached, `publicFundingOpen()` stays true and
`contribute(amount)` accepts public funding, still bounded by the deadline and full goal.
The campaign funding UI reads this flag, preserving the World gate on older contracts.
N counts humans, not wallets or USDC; a goal reached before N still ends funding normally.

## Standalone Arkiv reader (12.2)

Run `npm run dev -w @cinevest/web` and open `http://localhost:3000/explorer`.
Search all creators or an exact genre; load additional pages.
The route queries public Rabdi directly without a Cinevest API, SQL, wallet or private token.
Public RPC availability and CORS remain provider dependencies. Listings are explicitly
unverified metadata; the explorer links to the campaign on Arc for financial verification.

## Sponsor receipts (12.3)

The independent campaign reviewer calls
`approveSponsor(approvalId, sponsor, amount, conditionsHash, true)`.
The conditions hash commits to the independently reviewed agreement; conditions are
reviewed offchain, not automatically proven by this contract.
The reviewer can revoke an unused approval with the same arguments and `false`.

The sponsor approves the campaign to spend the exact USDC amount, then calls
`depositSponsor(approvalId, amount, conditionsHash)` after release.
The contract checks the actual received balance delta before applying the existing
revenue waterfall, repayment cap, rights expiry and rounding. Each exact approval is
single-use; additional deposits require another approval ID. No viewing access or
contribution units are granted.

## Accounting export (12.4)

```sh
FROM_BLOCK=<campaign-deployment-block> ARC_RPC_URL=https://rpc.testnet.arc.io \
  node scripts/claim-trace.mjs <campaign-address> claim-trace.json
```

FROM_BLOCK is optional (defaults to genesis); a later starting point is rejected if
campaign code already existed before it. An archive-capable Arc RPC is required.
The CLI pins a final block, scans complete campaign and USDC transfer histories in
bounded ranges, reconstructs the revenue waterfall and reward index, reproduces
each categorized payout, and compares totals, wallet receipts, reserves and token
balance with chain state. JSON uses decimal strings for base units; mismatch exits
nonzero. Unreserved token donations are reported separately. New milestone approval
events allow production payouts to be replayed across disputes and replacement evidence.
Use campaigns deployed from this revision for complete production-approval traces;
older revisions did not emit the necessary milestone approval events.

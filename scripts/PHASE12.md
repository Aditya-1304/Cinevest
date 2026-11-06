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

## Portable manifests and public consistency (12.5, 12.8)

Open `/explorer`, search Arkiv, and enter a public HTTPS Swarm gateway on a listing.
The reader checks creator ownership, expiry, factory registration and immutable terms
before reading the onchain pitch and milestone references. Raw manifest bytes must
reproduce the Swarm content address and match the existing versioned schemas.
Pitch title, genre, poster reference and creator must also match the listing.
Untrusted text is rendered as text; evidence is displayed as content references.

Export the same allowlisted public report from the browser or independently:

```sh
node apps/backend/scripts/public-consistency.mjs <arkiv-entity-key> <https-swarm-gateway> public-consistency.json
```

The CLI accepts an optional fourth positional argument for an explicitly selected
factory. It needs no SQL, Cinevest server, session, environment file or service token.
Endpoints must be public HTTPS URLs without credentials or query parameters.
The CLI uses public chain defaults; the shared reader also supports explicit public
Arc/Arkiv RPC URLs. Provider failures produce generic errors rather than leaking
request URLs. CORS must be enabled by providers for browser use.

Arc reads share one block number/hash. Arkiv query observations are recorded
separately; this is not an atomic cross-chain snapshot. The exported report contains
public references, commitments and check results, never manifests, provider asset
IDs, playback URLs, JWTs, signing keys or media API responses.

Media availability and signed-only delivery are explicitly **unverified**: the public
contract exposes a commitment hash, which cannot prove provider readiness or reveal
the underlying identifier. The current application uses **Mux**, while the governing
plan still names Livepeer. This extension neither conceals that mismatch nor migrates
providers. Full provider/access-policy acceptance remains a separate authenticated check.

## Threshold reviewer (12.6)

Deploy `ThresholdReviewer(signers, required)` and use its address in the campaign's
existing `reviewer` term. The committee has 2–32 unique EOA signers and a threshold of
at least two. The campaign creator must not be a committee signer.
Existing campaigns cannot change their immutable reviewer.

The committee accepts EIP-712 signatures over the exact campaign, action calldata
hash, per-campaign nonce and deadline. Chain ID and reviewer address are domain-bound.
Signatures must be ordered by recovered address; duplicates, outsiders, insufficient
votes, stale nonces and expired proposals cannot execute.
Successful execution consumes the nonce; failed campaign guards revert the nonce too.
The contract permits only milestone approval, dispute resolution, production
cancellation and sponsor approval. It cannot arbitrarily transfer campaign funds.

For milestone approval:

```sh
node scripts/review-proposal.mjs prepare <campaign> <milestone-1-or-2> proposal.json
node scripts/review-proposal.mjs assemble proposal.json signatures.json execution.json
```

Each committee member inspects the same proposal/evidence, then signs its `typedData`
with an EIP-712-capable wallet. Save the resulting signatures as a JSON array.
Assembly recovers/sorts signers and simulates execution on Arc before producing a
transaction for any relayer wallet to submit. The proposal expires after one hour.
For other permitted reviewer actions, encode the existing Campaign ABI function and
sign the same `Review` schema; `reviewDigest` exposes the contract's expected digest.

Stage, evidence-hash, dispute, release and escrow invariants remain enforced by
Campaign itself. The existing reviewer buttons target a single connected reviewer;
committee actions use the signature/relayer workflow above.

## Conditional recovery worker and media evaluation (12.7, 12.9)

No worker was started and no provider was migrated. Both remain conditional on real
operator measurements, as required by the plan. Do not invent acceptance measurements.

`scripts/extension-evidence.mjs` accepts strict, allowlisted JSON with optional
`workload` and `media` objects. Unknown fields are rejected, preventing accidental
inclusion of provider IDs, URLs or credentials in exported comparison reports.

Workload fields:

- `observedAt`: ISO UTC timestamp; evidence expires after 24 hours.
- `samples`: at least two observations across `periodSeconds` (positive).
- `recoverablePending`, `manualCapacityPerPeriod`: nonnegative integer counts.
- `oldestRecoverableSeconds`, `recoverySlaSeconds`: observed age and positive operational SLA.

The worker gate opens only when observed recoverable backlog exceeds measured manual
capacity and the oldest recoverable operation exceeds its recovery SLA.

Media fields:

- `constraints`: `minDeliverySuccessRate` (0–1), positive `maxStartupMs`,
  `maxCostUsdPerPeriod` (nonnegative).
- `baseline`, optional `alternative`: `provider` (`livepeer` or `mux`),
  positive integer `samples`, `observedAt`, positive `periodSeconds`,
  `deliverySuccessRate` (0–1), `p95StartupMs`, `measuredCostUsd`,
  booleans `signedOnly`, `unauthenticatedDenied`, `authorizedPlaybackSucceeded`.

A migration is justified only if fresh baseline cost/startup/availability measurements
fail the demo constraints and a different provider passes all constraints and privacy
checks over the same measurement period with at least as many samples. Reports label
these as operator-supplied observations, not independently attested provider evidence.
This tool evaluates a proposed change; it never performs a migration.

```sh
node scripts/extension-evidence.mjs measurements.json extension-readiness.json
node --conditions=react-server apps/backend/scripts/reconcile-worker.mjs measurements.json 60 20
```

The worker rejects startup unless fresh workload measurements justify it, checks the
gate before each pass, and stops when evidence expires or no longer justifies work.
It loads the same backend environment as the one-pass CLI and needs Node 26.
Passes are sequential, bounded to 1–100 recoverable operations, with a 10–3600 second
interval. SIGINT/SIGTERM stops after the current pass. The worker never signs chain
transactions. Restart/concurrent execution reuses the existing revision-checked
journal transitions; no process-local lock substitutes for database compare-and-set.
Pending/uploaded operations awaiting a creator transaction are excluded from recovery
selection so they cannot occupy every recovery slot.

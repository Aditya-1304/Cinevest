# P9.4–P9.7a implementation and evidence

Later issuance, UI and ABI work is recorded in [the Phase 9 handoff](phase-9-completion.md).

## Behavior

`POST /api/world/challenge` now stores a five-minute challenge before returning
its signed token. RP ID is included in the signed context. The database stores
hashes of the nonce and complete token, not the bearer token itself. A database
outage prevents challenge issuance.

`POST /api/world/verify` accepts `{token, proof}` from the SIWE wallet and validates
the signed context, expiry, protocol, expected single human credential and signal.
It forwards the **complete original IDKit response** to the official
`https://developer.world.org/api/v4/verify/<rpId>` endpoint, without remapping
identifiers or stripping integrity fields. Timeout, network, 429 and 5xx responses
produce 503; rejected proofs or mismatched results produce 400. Neither case
consumes the challenge. Numeric proof fields support official decimal SDK and hex
API encodings within uint256. Sessions and legacy proofs remain rejected.

After provider success, one PostgreSQL function call atomically:

1. Updates the matching challenge only if unused, unexpired and bound to the exact
   token, wallet, chain, campaign and environment.
2. Records the canonical proof fingerprint under a unique constraint.
3. Inserts or refreshes the campaign's identity binding only for its existing owner.

Any failure rolls the statement back, including challenge consumption. A duplicate
challenge/proof or different-wallet ownership conflict returns 409. Fresh proofs
for the same human and same wallet refresh the existing row. They do not create
another identity. Ownership is unique by `(chain, environment, campaign, scoped
nullifier hash)`. The hash uses the P9.0b RP/issuer/nullifier encoding. Old rows are
quarantined in the `legacy` environment; old unpersisted tokens cannot be accepted.
The stored credential expiry is the proof's conservative `expires_at_min` bound,
which must be in the future. Staging and production identities are isolated.

The response includes `verified`, verification ID, wallet, campaign, chain,
environment and scoped nullifier hash. **It is not a funding authorization.** P9.8
must issue the separate EIP-712 permission, restricted to the intended environment.
The earlier `/api/world/context` page remains a diagnostic flow; funding UI wiring
belongs to P9.9.

## Contracts

The factory retains its existing no-argument constructor. Its deployer can call
`configureWorldVerifierSigner(address)` once, using a nonzero address distinct
from the deployer. Only this administrator can configure it. Each gated campaign
captures the configured signer in an immutable; creators cannot choose a signer.
Gated creation requires a positive `perHumanLimit`. Ungated campaigns need no
signer and preserve their existing funding path.

There are exactly two contribution entrypoints:

- `contribute(uint256)` rejects all gated campaigns.
- `contributeWithAuthorization(uint256, WorldAuthorization, bytes)` accepts only
  gated campaigns. It checks wallet, campaign, nonzero nullifier/nonce, deadline,
  canonical ECDSA signer and unused EIP-712 digest. Chain ID and campaign address
  are included in the EIP-712 domain, so signatures cannot move across either.

The gated entrypoint binds each nullifier to its first wallet and counts lifetime
principal against the immutable per-human cap. New permissions cannot reset that
cap. Refunds do not reset it either. Both entrypoints share the same lifecycle,
goal, accounting and SafeERC20 transfer implementation and reentrancy guard.
Permission consumption and human binding happen before the transfer; a failed
transfer or other reverted contribution restores all state.

## Local verification

- `forge test --root contracts --match-contract CampaignWorldTest --fuzz-runs 256`:
  12 passing checks, including eight fuzz cases (2,048 runs). Covers every funding
  entrypoint against unsigned, expired, replayed, cross-chain, cross-campaign,
  substituted-wallet and second-wallet/same-human attempts, plus cumulative cap,
  transfer rollback, refund persistence and signer configuration.
- The TypeScript fixture in `authorization-vector.json` matches the actual
  campaign Solidity digest and recovers the expected signer.
- Backend World checks cover complete provider payload forwarding, success and
  failure handling, replay, simultaneously started requests, immutable ownership,
  rollback, same-wallet refresh, wallet substitution and expiry. These use PGlite
  (the PostgreSQL engine) with mocked World HTTP responses. PGlite serializes SQL
  statements; this is not live multi-connection Neon contention evidence.
- Contract build, application build, typecheck and focused lint are checked
  separately. No live proof or deployment is claimed by local checks.

Focused backend command:
`node --conditions=react-server --import ./apps/backend/scripts/register-paths.mjs apps/backend/lib/world/verification.test.mjs`

## Activation and remaining boundaries

Apply the checked-in `0008_world_verification` migration through the existing
`npm run db:migrate -w @cinevest/backend` workflow against the intended database.
The migration is locally validated; it has not been applied to hosted Neon here.
Deploy the new factory and configure its separate verifier signer before creating
gated campaigns. Existing deployments remain on their original bytecode.

Compiled contract artifacts contain the new interface. Final package ABI
regeneration, deployment compatibility updates and frontend hook changes remain
P9.8b, as required by the plan. Authorization issuance and its retry journal are
P9.8/P9.8a. No signer secret was created or read for this change.

Real staging proof/nullifier-scope evidence from P9.0a is still outstanding. The
implementation keeps the documented v4-only and RP/issuer-scoped identity policy;
validate it against real same-human/two-wallet proofs before issuing permissions.

Official API reference:
https://docs.world.org/api-reference/developer-portal/verify

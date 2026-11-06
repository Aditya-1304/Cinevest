# Phase 9 implementation handoff

## Implemented

P9.8 issues an EIP-712 permission through `POST /api/world/authorize` with `{token}`.
The wallet comes from SIWE. The signed token must identify the exact consumed
challenge and verified identity. Caller-supplied wallet, nonce, campaign or identity
fields are rejected by the request schema. The backend checks the canonical Arc
registry and runtime revision, campaign signer, funding lifecycle, human owner and
remaining cumulative cap at one source block before issuing a permission.

The server-only `WORLD_VERIFIER_PRIVATE_KEY` must match the campaign's immutable
signer and differ from the RP signing key. The permission deadline is at most five
minutes away and no later than the original challenge or its proof-specific
credential bound. `WORLD_AUTHORIZATION_ENVIRONMENT` defaults to `production`;
staging proofs require explicitly selecting staging for both World environments
on this testnet-only application. No staging proof is silently promoted to a
production identity.

P9.8a stores one permission per consumed challenge, with unique nonce and digest.
The signature is persisted before it is returned. Concurrent candidates return
only the winning stored row. Retrying the same token returns that same signature
while it remains valid and unused. An expired or used permission requires a fresh
proof; no replacement is signed against the old challenge. Verification and
issuance are separate endpoints so a lost HTTP response can be recovered without
reconsuming the proof. Migration 0009 snapshots each challenge's verified identity
and credential bound; later proofs cannot extend the old challenge's lifetime.
Existing consumed challenges without that snapshot require fresh verification.

P9.8b regenerated compiler JSON and TypeScript ABIs, including the protected
contribution entrypoint and verifier reads. The pure EIP-712 encoder is now shared
by backend and browser in `packages/abi`. Generation correctly marks the recorded
factory deployment `compatible: false`, because its bytecode predates Phase 9.
Backend registry reads and browser funding actions reject that mismatch. The
browser additionally compares the factory runtime to the deployment manifest.
This local regeneration is complete; deployed-bytecode acceptance is **not**.

P9.9 connects World IDKit to proof verification and permission recovery in the
funding card and standalone challenge page. It shows denied, unavailable, expired
and ready states. The funding button requires a permission matching the connected
wallet, campaign, chain and expiry. Before any USDC approval, it checks the signed
digest, current onchain signer, replay state, nullifier owner and cumulative cap.
It rechecks expiry after approval and simulates `contributeWithAuthorization`
before submission. Successful funding clears the permission. Ungated campaigns
keep their original `contribute` path. Neither path can bypass the onchain gate.

P9.10 is recorded in [the World sponsor debrief](debrief.md).

## Verification from this implementation

- All 154 Foundry checks passed, including World fuzz coverage and the solvency
  invariant (128 runs, 8,192 calls, zero reverts). This also covers the older
  creator-provenance, pitch-commitment and cancellation-grace blockers required
  before ABI regeneration. Their source and regression evidence are present;
  this is not a claim of a newly deployed factory.
- Six existing focused backend World checks passed with migrations 0008 and 0009.
  They use isolated PGlite and mocked World HTTP; no hosted database was changed.
- A manual local issuance smoke check, using the public development fixture key
  and mocked Arc state, returned the same digest and signature for two concurrent
  issuance calls and stored one row. Wallet substitution and a tampered token
  were rejected; an expired retry returned 410 and did not create another row.
- Production builds and TypeScript checks pass. Focused lint and whitespace checks
  pass. Repository-wide lint still reports four pre-existing errors in the landing
page and wallet policy. Browser bundle inspection found no World RP or verifier secret references.
- The standalone World page renders its verification/sign-in controls over HTTP.
  Collaborative browser snapshots timed out twice; the fallback browser was
  unavailable. No browser interaction or real IDKit completion is claimed.

## Remaining live acceptance

The workspace lacks `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY` and
`WORLD_VERIFIER_PRIVATE_KEY`. No real staging proof has been collected. P9.0a uses
its allowed limitation-disclosure path: same-human/two-wallet nullifier stability
and dynamic action acceptance remain unverified. P9.1 still needs portal setup
and an opened widget; P9.8b still needs matching deployed bytecode. Phase 9 cannot
be marked fully live-accepted until these are completed.

Activation sequence:

1. Configure the official World app/RP and campaign action prefix. Supply server
   credentials privately in the backend environment. Use a separate verifier key;
   never use the public fixture key. For simulator work, explicitly select staging
   in both World environment settings.
2. Apply the checked-in migrations with
   `npm run db:migrate -w @cinevest/backend` against the intended database.
3. Deploy the compiled factory with the existing wallet deployment workflow and
   configure its verifier signer once. Regenerate deployment/ABI exports from the
   verified receipt. Do not edit `compatible` manually to bypass the check.
4. Record real staging same-human/two-wallet/fresh-challenge evidence from the
   matrix in `phase-9-setup.md`, then exercise denied, expired and successful
   funding against that exact deployment and signer.

No live migration, wallet transaction or deployment was performed in this slice.
No new test files were added. Existing contract regressions were run for the ABI
freeze prerequisite; local smoke checks do not replace real-provider acceptance.

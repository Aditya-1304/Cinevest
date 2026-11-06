# Cinevest backend through Phase 7

The governing requirements are `Cinevest_TECH_SPEC_AND_BUILD_PLAN_UPDATED.md`.
This service owns public discovery, artifact validation, publication recovery, and
listing renewal. Arc is the authority for financial state. The server never holds
an Arc transaction-signing key. SIWE, Livepeer playback authorization, and World
attestations belong to Phases 8–9. World-gated contributions remain fail-closed.

## Run and verify

Use Node 26 and run `npm install` from the repository root. The backend imports
`@cinevest/abi`; its shared chain configuration and factory address come from the
verified deployment manifest. Run these commands from the repository root:

```sh
npm run typecheck -w @cinevest/backend
npm run test -w @cinevest/backend
npm run build -w @cinevest/backend
npm run dev -w @cinevest/backend
npm run contracts:test
npm run contracts:abi
node scripts/assert-testnet-only.mjs
```

The test runner executes individual Node test cases, including isolated PostgreSQL
migrations and the actual Drizzle store's revision checks. Foundry also runs
state-machine invariants, arithmetic fuzz cases, token callback attacks, and the
one-versus-100-backer gas comparison.

`apps/backend/.env.local` is ignored by Git and contains local credentials. The
configured Neon project is isolated for Cinevest testnet metadata. `DATABASE_URL`
uses pooling; `DATABASE_URL_UNPOOLED` is used only by migrations. Run
`npm run db:migrate -w @cinevest/backend` to apply the ordered Drizzle migrations.
Never copy credentials into source, logs, frontend variables, or the verification
reports. `.env.example` lists all recognized settings, including Bee upload,
gateway and postage configuration. An empty integration is unavailable; health
does not claim that the integration has been tested just because keys exist.

Run `npm run verify:live -w @cinevest/backend` for credential-free provider
diagnostics, saved in `docs/backend-live-verification.json`. It exercises a real
database compare-and-set using a temporary synthetic workflow and deletes only
that row. It sends no wallet transaction. With the built backend running on port
3001, `npm run test:api -w @cinevest/backend` verifies HTTP validation boundaries.

## API contract for the frontend teammate

The backend supports the following API paths on port 3001; legacy `/films`,
`/film/:chain/:campaign`, `/publications` and `/swarm/:reference` paths also work.
The frontend teammate must route these through the web app's trusted origin.
No files under `apps/web` were changed by this backend work.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Public readiness flags and factory compatibility; no credential values |
| `GET /api/market?genre=&deadline=&cursor=&owner=` | All owners by default; `owner` explicitly selects the creator dashboard |
| `GET /api/film/5042002/:campaign` | Canonical Arc terms/stage even after Arkiv expiry; `listingStatus` is explicit |
| `GET /api/swarm/:reference?kind=pitch&campaign=:address` | Verifies Swarm bytes and the Arc pitch commitment |
| `GET /api/swarm/:reference?kind=milestone&campaign=:address&index=1` | Verifies campaign, milestone, reference, manifest version, and bytes |
| `GET /api/swarm/:reference?kind=poster` | Returns size-bounded public image bytes; SVG is refused |
| `GET /api/swarm/health` | Checks Bee health, postage usability and TTL |
| `POST /api/artifacts` | Signed public poster, pitch, or creator-only production evidence upload |
| `POST /api/publications` | Prepare, register wallet-returned IDs, reconcile, or authorize missing Arkiv publication |
| `GET /api/publications?actor=&digest=` | Public journal status by publication identity |
| `GET /api/workflows/:operationId?actor=&issuedAt=&signature=` | Creator-signed operation recovery lookup |
| `POST /api/listings/extend` | Creator-only renewal preflight and durable confirmation/reconciliation |
| `GET /api/auth/nonce` | Issues a five-minute, one-time SIWE nonce |
| `POST /api/auth/verify` | Verifies an EOA SIWE signature and returns its address and chain ID; it creates no session |
| `POST /api/arkiv-rpc` | Bounded allowlist relay for creator-signed Rabdi transactions; no server signing |

All signed requests use `publicationMessage(payloadWithoutSignature)` from
`lib/workflows/publication-request.ts`: recursively sorted JSON, domain
`Cinevest publication journal`, with `issuedAt` in Unix seconds and a ten-minute
freshness window. Sign the exact payload sent, including its `action`. This is an
EOA-first Phase 7 boundary; EIP-1271 and SIWE sessions are not claimed as supported.
The workflow read action is `workflow-read` and includes its `operationId`.

### Public artifacts

`artifact-upload` accepts `{ actor, kind, payload, issuedAt, signature }`.
For a poster, `payload` is `{ contentType, base64 }`, with a five-MiB limit and
matching JPEG/PNG/WebP/GIF header. For a pitch it is the versioned input from
`lib/swarm/pitch.ts`: `title`, `synopsis`, `posterRef`, `genre`, `creator`, and
`rightsNotice`. Milestones use the input in `lib/swarm/milestone.ts` and require
the Arc creator in Production. All content is explicitly public; private films
belong to the Phase 8 Livepeer upload path.

The sole new-write identities are `Cinevest.pitch.v1`, `Cinevest.milestone.v1`, and
`Cinevest.film.v1`. Old `clipstake.*` schemas are not silently rewritten or treated
as Cinevest listings. The pitch encoder and reader use the same schema. Arkiv
strings are limited to 128 UTF-8 bytes. `campaignTermsDigest` from `@cinevest/abi`
hashes the chain ID and compiler-defined immutable tuple with ABI encoding and
Keccak-256. The fixed test vector lives in `candidate-validation.test.mjs`.

### Recoverable publication

1. Upload the public poster. Encode the final pitch and compute its public Swarm
   root using `ChunkSplitter.root(bytes)` from `@ethersphere/core-sdk`.
2. Sign `prepare` with `{ actor, arcChainId: 5042002, terms, manifest, issuedAt }`.
   `terms.pitchReference` must equal that root. The service creates the durable
   operation before uploading and returns its digest, reference and next step.
3. The creator sends `factory.createCampaign(terms)` on Arc. Immediately send
   `register` with `{ actor, arcChainId: 5042002, terms, arcTxHash, swarmReference,
   issuedAt }`. Monetary values and uint64 fields in `terms` are decimal strings;
   `funderBps`/`repaymentCapBps` are numbers and `worldGated` is a boolean.
4. Sign `reconcile` with `{ actor, digest, issuedAt }`. Confirmation requires the
   stored transaction, creator sender, configured factory, canonical event,
   registry membership, and exact intended terms. Provider uncertainty does not
   trigger a new Arc deployment.
5. Sign `arkiv` with `{ actor, digest, issuedAt }` to obtain a publication slot.
   A 409 response with `authorized: true` permits the connected creator to publish
   on Rabdi; it is not an application error. Use the browser-safe
   `lib/arkiv/creator-wallet.ts` adapter, which switches to Rabdi and requires the
   creator account. Pass the terms confirmed by the Arc detail endpoint.
6. Persist `arkivTxHash`/`entityId` via the same `arkiv` action immediately when
   returned. A lost response remains uncertain until the entity is found or the
   recorded transaction proves it reverted. Never blindly resubmit createEntity.

The legacy `swarm` action uploads a pitch with `actor`, `title`, `genre`,
`synopsis`, `posterRef`, and `rightsNotice`; new publication flows should use
`prepare` to journal the upload boundary. A pending write without any recoverable
provider ID can require creator intervention rather than an unsafe automatic retry.

`npm run reconcile -w @cinevest/backend -- 20` performs bounded read-only provider
reconciliation and journal updates. It submits no external transaction. Database
unique indexes and revision-based compare-and-set updates guard concurrent calls,
including updates that remain in `publishing` status.

### Discovery and renewal

Discovery uses stable key ordering and opaque filter-bound cursors, with bounded
pages/candidates, RPC timeouts/backoff and explicit partial/unavailable results.
Deduplication happens after immutable-term verification so a forged first record
cannot suppress a valid listing. Arc reads are concurrency-bounded and pinned to
one block per batch; duplicate candidates share chain reads. Only verified public
metadata is cached for 60 seconds; stale responses contain no financial totals.
Payment authorization must re-read Arc.

`extend-listing` requests include `{ actor, entityId, campaignAddress, targetBlock,
issuedAt, signature }` and optionally `txHash`. Renewal requires the original Arc
creator to remain the actual Arkiv owner. The maximum target is a 30-day block
horizon. Use `extendCreatorListing` with the authorized absolute block, then
journal the returned hash. Retries check current expiry and recorded receipt;
ownership transfers are unsupported. An expired listing cannot be revived by this
route, while its Arc campaign remains accessible. Arkiv expiry is measured in
blocks, as described in the [official expiry documentation](https://docs.arkiv.network/writing/expiration/).

## Contract compatibility and deployment

The corrected factory requires the creator to submit creation and a nonzero pitch
commitment. Campaigns have a fixed seven-day grace period after their production
deadline, after which anyone can cancel unfinished production and recover unspent
principal pro rata. Released films remain protected from cancellation. Generic
`ClaimPaid` events remain, with typed `PayoutPaid` events for indexing. Playback
hashes commit identifiers; they are not evidence that Livepeer is available.

Run `npm run contracts:deploy:arc` and sign the tested factory creation from the
specified wallet. The signing page verifies sender, creation bytecode, runtime,
USDC, chain, and receipt, archives the prior manifest, and regenerates shared
exports. `arcTestnetDeployment.compatible` is false until the manifest matches the
compiled revision. Backend finance readers fail closed during that mismatch.
Rebuild/restart the backend after a new deployment so it imports the new manifest.

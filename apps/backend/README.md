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
| `POST /api/auth/verify` | Verifies an EOA SIWE signature, returns its address and chain ID, and starts the cookie session |
| `GET /api/auth/session` | Protected: returns the signed-in wallet, `401` for guests |
| `POST /api/auth/logout` | Clears the session cookie |
| `POST /api/media/uploads` | Creator session: starts or resumes (same `attemptKey`) a direct-to-Livepeer upload; returns the upload URLs |
| `GET /api/media/uploads/:id` | Owner session: reconciles with Livepeer and reports the real status (`pending/uploading/processing/ready/failed`) |
| `GET /api/media/release?arcChainId=&campaignAddress=` | Public: selected release hash, lock state, and whether it equals Arc `livepeerPlaybackIdHash` |
| `POST /api/media/release` | Creator session: enforces the JWT policy, runs the delivery probe, then selects exactly one provider-ready upload and returns the hash for `configureRelease` (`409` with probe checks if protection fails) |
| `GET /api/media/release/verify?arcChainId=&campaignAddress=` | Creator/reviewer session: live final-review gate (provider ready, JWT policy, hash = DB = Arc, delivery probe) |
| `POST /api/playback/authorize` | Session wallet that Arc says paid for a released film gets `{playbackId, token, expiresAt, refreshAt}` |
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


## Sessions, CSRF and media (Phase 8.4–8.6)

- **Session:** `cinevest_session` is a signed HS256 JWT (`SESSION_SECRET`, 8 h, issuer/audience pinned) in an
  `HttpOnly; SameSite=Strict; Path=/api` cookie, `Secure` whenever `APP_URL` is HTTPS. It is stateless: logout
  clears the cookie, and the short lifetime bounds a leaked token. Protected routes call `authenticate(request)`.
- **CSRF / allowed host:** every state-changing route requires `Origin` to equal the `APP_URL` origin (the web
  app proxies `/api`, preserving `Origin`) and rejects cross-site `Sec-Fetch-Site`; a missing or foreign origin fails
  closed with `403`. The SIWE `domain`/`uri` must also match `APP_URL`.
- **Wallet policy (EIP-1271):** only EOA signatures are accepted. Smart-contract wallet signatures are
  unsupported and fail closed with `401`.
- **Upload flow:** the session wallet must equal the Arc campaign creator. The attempt row is saved, then the
  server calls Livepeer (key never reaches the browser; asset requested with a non-public `jwt` playback
  policy), saves the provider asset ID, then returns the direct-upload URL. The browser uploads straight to
  Livepeer, so video bytes never touch Next.js. Retrying with the same `attemptKey` returns the same attempt and
  URLs while it is `uploading`; URLs are cleared once it leaves that state. Declared type
  (`mp4`, `quicktime`, `webm`, `x-matroska`) and size (2 GiB) are validated up front; Livepeer's reported size is
  re-checked at reconciliation. Up to 10 attempts per creator and campaign. A lost provider response leaves a
  `pending` row that is retried; an orphaned provider asset is never selected.
- **Status machine:** `pending → uploading → processing → ready`, any non-terminal state → `failed`; `ready` and
  `failed` are terminal. Transitions are compare-and-set SQL updates, so duplicate pollers or an API timeout
  cannot regress or double-ready an upload. Provider errors keep the stored status and return `stale: true`.
- **Release selection:** one `campaign_media_release` row per `(arcChainId, campaignAddress)`; the upload must be
  re-confirmed `ready` by Livepeer at selection time. `playbackIdHash = keccak256(UTF8(playbackId))`
  (Solidity `keccak256(bytes(id))`); vectors: `"abc"` → `0x4e03657a…2d6c45`,
  `"f5eed5c0wjwdj3nv"` → `0x2ba21022…5bc682`. The selection locks when Arc shows the campaign released/cancelled
  or all tranches approved (the point the contract rejects `configureRelease`); a locked selection cannot be
  changed. The release hash and Arc's stored hash are compared by `GET /api/media/release` (`matchesArc`).
  These are trusted offchain checks, not onchain proof.


## Protected playback (Phase 8.7–8.9)

- **Policy:** assets are created with, and re-confirmed to have, a `jwt` playback policy (`ensureJwtPolicy`
  PATCHes then re-reads; it throws unless Livepeer reports `jwt`).
- **Delivery probe (`lib/media/probe.ts`):** as an anonymous client it fetches the HLS manifest and first
  segment (must be `401/403`), then with a valid token (must be `200`), and the manifest with an expired,
  wrong-asset and bad-signature token (must all be `401/403`). Provider-supplied URLs must be HTTPS on a Livepeer host
  allowlist. Only status codes and the policy are stored on `media_uploads` (`policy_type`, `probe_result`,
  `probed_at`); tokens and URLs are never stored or logged. Selection and `/release/verify` both run it, so a
  stale, wrong or unready asset is blocked and the reason is logged (`media.release.verify_failed`). The UI must
  call `/release/verify` before enabling final approval; these results are trusted offchain evidence, not onchain proof.
- **Authorization:** the wallet comes only from the session and the asset only from the release row. Access is
  denied unless the campaign is Arc `Released`, `hasPaidAccess(wallet)` is true, and the stored selection, recomputed
  hash and Arc `livepeerPlaybackIdHash` are identical. Arc RPC or database failure returns `503` (fail closed).
- **Token:** ES256 JWT in the `@livepeer/core` `signAccessJwt` format (`action=pull`, `iss`, `pub`, `sub=playbackId`,
  `video`, `iat`, `exp`), 300 s lifetime, signed with `LIVEPEER_SIGNING_KEY` (base64 PKCS8 PEM from Studio) and
  `LIVEPEER_SIGNING_PUBLIC_KEY` (base64, as Studio returns it). A mismatched pair refuses to sign. Pass it to the
  player or as `Livepeer-Jwt`/`?jwt=`. **Renewal:** call authorize again before `refreshAt`; a new token overlaps the
  old one, so playback is not interrupted. **Disclosure:** a token is a bearer credential and can be shared until it expires.
- **Key rotation:** create the new key in Studio, set both env values and deploy, then delete the old Studio key
  only after 300 s so in-flight tokens still validate.
- **Verification status:** the token format was checked against the official SDK's output and the probe logic against a
  fake provider that verifies tokens. No real Livepeer asset has been probed yet (no API key in this checkout), so
  Livepeer's actual playback-info shape and JWT delivery behavior still need one live run.

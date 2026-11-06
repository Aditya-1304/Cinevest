# Phase 8 manual verification (Mux)

Runbook for verifying Phase 8 (SIWE session, media upload, protected playback) end to end. Video hosting is **Mux**
(Livepeer Studio closed new sign-ups). Parts 1-4 need only a Mux account. Parts 5-6 need a campaign that reaches
`Released` and a wallet that paid. Do not paste or commit any secret from this file's steps.

Everything the code assumes about Mux but could not be confirmed offline is listed in part 7. If a step fails, send the
exact response body or console error.

## 0. Offline checks (no accounts needed)

From the repo root: `npm install` (new dependency `@mux/mux-player-react`).

- [ ] `cd apps/backend && npm run typecheck` and `cd apps/web && npm run typecheck` pass.
- [ ] `npx eslint apps/backend/lib apps/backend/app apps/web/src` has no errors (the "Pages directory" notice is expected).
- [ ] `cd apps/backend && node --conditions=react-server --import ./scripts/register-paths.mjs lib/media/playback.test.mjs`
      passes 8/8 (guest/forged session/wrong chain/other wallet/unpublished film/SIWE replay/Arc outage/lost upload/duplicate callbacks/deleted asset).
- [ ] `npm test` in `apps/backend` (whole suite, includes the new `media` directory) passes.

## 1. Environment and database

- [ ] **Backend `.env.local`:** `APP_URL`, `SESSION_SECRET` (32+ chars), `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
      `ARC_RPC_URL`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY`.
      Remove every `LIVEPEER_*` variable (no longer read).
- [ ] `APP_URL` is the exact public **web** origin the browser uses (`http://localhost:3000` locally, `https://<domain>` deployed).
      SIWE domain/URI, the CSRF origin check and Mux's browser-upload CORS origin all derive from it.
- [ ] **Web env:** `BACKEND_URL` points at the backend (default `http://localhost:3001`); the web app proxies `/api/*` to it.
- [ ] **Migrations:** `cd apps/backend && npm run db:migrate` (needs the unpooled connection string). It applies 0004-0007.
      Confirm tables `media_uploads` and `campaign_media_release` exist, `media_assets` is gone, and `media_uploads`
      has `provider_upload_id`, `provider_asset_id`, `duration_seconds`, `policy_type`, `probe_result`, `probed_at`.
- [ ] **Deployment host:** set the same variables there (never in the repo).
- [ ] Run: backend `npm --workspace @cinevest/backend run dev` (port 3001), web `npm --workspace @cinevest/web run dev` (port 3000).
      `GET http://localhost:3001/health` should show `configured.mux: true` and `configured.database: true`.

## 2. Mux setup

- [ ] Create a Mux account and use **one environment** for everything below (tokens and signing keys are per environment).
- [ ] **API token:** Settings -> API Access Tokens -> create with Mux Video read and write permission. Put the ID and
      secret in `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET`.
- [ ] **Signing key:** Settings -> Signing Keys -> generate (or `POST https://api.mux.com/system/v1/signing-keys`).
      The private key is shown **once**. Put the key ID in `MUX_SIGNING_KEY_ID` and the base64 private key in `MUX_SIGNING_PRIVATE_KEY`.
- [ ] Check your plan's current free limits. Dev uploads use real quota; delete test assets in the dashboard afterwards.

## 3. Sign-in and CSRF (no Mux needed)

Open `http://localhost:3000/watch/5042002/<any campaign address>`.

- [ ] Connect a wallet and click "Sign in with wallet". DevTools -> Application -> Cookies: `cinevest_session` is
      `HttpOnly`, `SameSite=Strict`, `Path=/api`, and `Secure` when `APP_URL` is https.
- [ ] `GET /api/auth/session` (in the browser) returns 200 with your lowercase address.
- [ ] **Origin through the proxy (unverified):** the sign-in itself must succeed through the Next rewrite. If a legitimate
      sign-in returns 403, `Origin` / `Sec-Fetch-Site` is not surviving the rewrite.
- [ ] Negative: `curl -i -X POST http://localhost:3001/api/auth/logout` (no Origin) returns 403.
- [ ] `POST /api/auth/logout` from the page clears the cookie; `GET /api/auth/session` then returns 401.
- [ ] Replay: sign in, then re-send the exact same `/api/auth/verify` body (copy as fetch from DevTools); second call returns 401.

## 4. Creator upload, probe and release selection

There is no creator upload UI. After signing in on the web origin with the **campaign creator wallet**, use the browser
console (cookie and `Origin` are sent automatically). Use a **short** film (mp4/mov/webm/mkv, under 2 GiB, under 4 h).

```js
const key = crypto.randomUUID();
const post = (path, body) => fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
const campaign = "0x...";   // a campaign this wallet created
const up = await post("/api/media/uploads", { arcChainId: "5042002", campaignAddress: campaign, attemptKey: key, contentType: "video/mp4", sizeBytes: FILE_BYTES });
up   // { id, attemptKey, status: "uploading", uploadUrl, stale: false }
```

- [ ] **Upload:** `curl -X PUT -T film.mp4 "<uploadUrl>"` (the bytes go straight to Mux).
- [ ] **Resume:** repeat the POST with the same `attemptKey`: same `id` and same `uploadUrl`. A different wallet using that key gets 409.
- [ ] **Status:** poll `GET /api/media/uploads/<id>`. It stays `uploading` until the file arrives (Mux creates the asset then),
      then `processing`, then `ready`. `stale: true` means a Mux call failed or timed out; status is unchanged and retrying is safe.
- [ ] **Select:** `await post("/api/media/release", { arcChainId: "5042002", campaignAddress: campaign, uploadId: up.id })`.
      This is the first real test of signed-only enforcement and the delivery probe.
  - Success returns `{ uploadId, playbackIdHash }`.
  - `409 "Playback protection check failed"`: read `reason` and `checks`. `checks` holds the HTTP status Mux actually returned
    for each probe request (anonymous, signed, expired, wrong-asset, bad-signature, segment). See part 7 if a code differs from 401/403.
- [ ] **Hash:** the playback ID is shown in the Mux dashboard (the asset's signed playback ID). From `apps/backend`:
      `node -e "import('viem').then(v=>console.log(v.keccak256(v.stringToBytes(process.argv[1]))))" <playbackId>`
      must equal `playbackIdHash`.
- [ ] **Stored evidence:** in the database, `select status, policy_type, probe_result, probed_at, duration_seconds from media_uploads`
      shows `policy_type = signed` and the probe status codes (no tokens).
- [ ] In the Mux dashboard the asset has only a **signed** playback ID (no public one).
- [ ] Failure cases: select an upload that is not `ready` returns 409; a non-creator wallet returns 403; invalid `arcChainId` returns 400.

## 5. On-chain steps (no UI exists for these)

Use the Arc explorer's write tab or a viem script. `cast` is not installed in this repo.

- [ ] **Creator:** with the campaign in Production stage, call `configureRelease(<playbackIdHash>)`. (Final milestone approval reverts
      until a playback hash is configured.)
- [ ] `GET /api/media/release?arcChainId=5042002&campaignAddress=<campaign>` returns `selected: true`, `matchesArc: true`.
- [ ] **Final-review gate:** as creator or reviewer, `GET /api/media/release/verify?arcChainId=5042002&campaignAddress=<campaign>` returns
      `ok: true` with `selected`, `providerReady`, `nonpublicPolicy`, `hashMatchesArc`, `playbackProtected` all true and
      `evidence: "trusted-offchain"`. Any other wallet gets 403.
- [ ] **Reviewer:** approve all three milestones. The selection then locks: `GET /api/media/release` shows `locked: true`, and
      re-selecting returns 409.
- [ ] **Creator:** `publishFilm()`.
- [ ] **Viewer wallet:** `buyAccess()` with test USDC. There is no purchase UI.

## 6. Paid playback and negative checks

- [ ] **Paid wallet:** sign in on `/watch/5042002/<campaign>` with the wallet that bought access; the film plays.
- [ ] **Token lifetime:** in DevTools -> Network, the single `POST /api/playback/authorize` response has `token` and `expiresAt`.
      `expiresAt` is roughly film length + 15 minutes. There is no mid-play renewal. Decode the token's payload (no secret needed):
      `sub` = the playback ID, `aud` = `v`, `kid` = your signing key ID.
- [ ] **Recovery:** interrupt playback (DevTools offline for a while, or let a paused tab sit). On error the page shows a Retry;
      Retry requests a fresh token and resumes.
- [ ] **Unpaid wallet:** sign in with a wallet that did not buy access: the page says it has not purchased access; the API returns 403 and no token.
- [ ] **Signed-out / guest:** the sign-in screen appears; `POST /api/playback/authorize` returns 401.
- [ ] **Unreleased film:** the page says the film has not been released; the API returns 404.
- [ ] **Direct media access (P10.6a evidence):**
  - `curl -i https://stream.mux.com/<playbackId>.m3u8` -> expect 403 (or 401).
  - `curl -i "https://stream.mux.com/<playbackId>.m3u8?token=<token from the authorize response>"` -> expect 200 with `#EXTM3U`.
  - Open the returned manifest, follow one child playlist and one segment URL: anonymous (remove `token=`) is denied, with the token it is served.
  - Expired, wrong-asset and bad-signature tokens are already checked by the probe; confirm their statuses in `probe_result`.
  - Save the status codes as evidence. Do not save tokens.
- [ ] **Browser:** no CORS errors in the console while the player loads.

## 7. Unverified assumptions (check these first if something fails)

| Assumption | Where to fix if wrong |
|---|---|
| Mux returns 401 or 403 for a missing/expired/invalid/wrong-asset token. | `denied()` in `apps/backend/lib/media/probe.ts` |
| Asset status names are `preparing`, `ready`, `errored`; upload status `waiting`, `asset_created`. Anything else is treated as failed. | `assetStatus()` in `lib/media/reconcile.ts`, `getUpload` use there |
| `video_quality: "basic"` and `playback_policies: ["signed"]` are accepted on direct upload. | `createUpload()` in `lib/media/mux.ts` |
| Token header/claims (`RS256`, `kid` in header and claims, `aud` = `v`, `sub` = playback ID) are accepted by Mux. | `lib/media/playback-token.ts` |
| `MuxPlayer` accepts `tokens={{ playback }}` and `onError` fires on playback failure. | `apps/web/src/components/playback/protected-player.tsx` |
| `Origin` / `Sec-Fetch-Site` survive the Next `/api` rewrite (also `Set-Cookie` coming back). | `lib/auth/origin.ts` |
| Child playlist and segment URLs in a signed Mux manifest are pre-signed by Mux (cdn, expires, skid, signature); the probe requests them as given and strips the whole query for the anonymous check. | `fetchOnce()` in `lib/media/probe.ts` |

## 8. Known limits

- No creator upload screen, no `configureRelease` screen, no purchase button (P10.6). The final-review gate endpoint exists
  but the milestone panel does not call it before enabling approval (P8.7b requires that in the UI).
- No webhook endpoint; upload status updates only when `GET /api/media/uploads/:id` (or the select/verify routes) polls Mux.
- A lost response from Mux can leave an unused upload; it is never selected. Remove strays in the Mux dashboard.
- The public `GET /api/media/release` makes several Arc RPC reads per call and has no rate limit.
- Sessions are stateless: logout clears the cookie; a stolen cookie works until it expires (8 h).
- Playback tokens are bearer credentials valid until `expiresAt` (film length + 15 min, up to 6 h) and can be shared until then.
- The contract field is still named `livepeerPlaybackIdHash`; it holds `keccak256(UTF8(Mux signed playback ID))`.

## 9. Housekeeping

- [ ] Review the diff, then commit (`package-lock.json`, `apps/web/package.json`, `apps/web` player and session hook,
      `apps/backend/lib/media`, `app/api/media`, `app/api/playback`, `drizzle` 0004-0007, tests, README). Leave out the unrelated
      untracked `compose.yml`.
- [ ] Tick the P8.x boxes in `Cinevest_TECH_SPEC_AND_BUILD_PLAN_UPDATED.md` once parts 3-6 pass.
- [ ] **Key rotation:** create a new Mux signing key, set `MUX_SIGNING_KEY_ID` and `MUX_SIGNING_PRIVATE_KEY`, deploy, and delete the old
      key only after the longest outstanding token (6 h) has expired.

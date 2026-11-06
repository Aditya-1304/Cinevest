# Release safety and recovery audit (P11.3a)

Scope: paid playback, release integrity and what survives provider loss. Findings come from reading `apps/backend/lib/media/*`, `app/api/playback/authorize/route.ts` and the Campaign contract, plus the live probe results recorded in `docs/phase8-manual-verification.md`.

| Case | Behaviour | Evidence / code |
|---|---|---|
| Playback without paying | Authorization is refused: the backend checks `hasPaidAccess(wallet)` on Arc (`lib/media/arc.ts`) before signing a token | `playback/authorize` route; `hasAccess` false → true after `buyAccess` in `docs/fixtures.md` |
| Direct HLS manifest/segment without a token | Denied by Mux for signed-playback assets (probe asserts anonymous = denied) | `media/probe.ts` `manifestAnonymous` |
| Expired / wrong-asset / tampered token | Denied by Mux; probe asserts all three before a release can be published | `media/probe.ts` |
| Replayed signed playback | A token is a bearer credential until expiry (15 min – 6 h, tied to film length). Replay inside the window works for anyone holding the URL. | `media/playback-token.ts`. **Residual risk, accepted.** Mitigation: short TTL, tokens never logged (`lib/log.ts` redacts token/key/signature fields). |
| Wrong playback hash | The Arc `livepeerPlaybackIdHash` (kept for ABI compatibility; stores the Mux playback hash), the DB release row and the stored upload must all match, otherwise authorization and publish are refused | `verify-release.ts` `hashMatchesArc`; authorize route lines checking `onchainHash` |
| Revoked / changed Mux policy | If the asset is deleted or made public the probe fails and the release cannot be (re)verified; already-issued tokens stop working when the signing key or asset is removed. Rotating the signing key invalidates tokens after at most 6 h. | `playback-token.ts` comment; runbook "Video (Mux)" |
| Swarm content unavailable | Pitch/poster/evidence are fetched through the backend, which re-checks bytes against the digest committed on Arc; missing bytes show an error, never altered content. Re-upload of identical bytes restores the same reference. | `docs/runbook.md`, `arkiv/swarm.md` |
| Arkiv listing expires | Only discovery is lost. Funds, stage and entitlements are on Arc; the film page works by direct link and shows "Not listed on Arkiv". Owner can renew. | `film-story.tsx`, `/api/listings/extend` |
| Entitlement after Arkiv/DB loss | paid access is immutable on Arc; a viewer keeps access, and a restored backend can reissue tokens | `Campaign.buyAccess` |

## Trusted off-chain assumptions
1. **Mux** enforces signed playback at the CDN and truthfully reports asset status; Cinevest cannot prove the video behind a playback ID is the film beyond the creator's committed hash.
2. **The reviewer** is trusted to approve milestones honestly (disclosed in the UI); Arc only enforces that approval comes from the committed reviewer wallet.
3. **The backend** issues playback tokens and viewing sessions; it cannot move funds or change stage. Metering settlement uses a separate meter signer (`docs/pay-per-view.md`).
4. **Chainlink CRE** checks Arc commitments and Mux readiness only; it is advisory and does not replace the independent reviewer (`docs/cre.md`). World ID is retired; legacy World-gated contracts remain for old artifacts.
5. A paying viewer can share a valid token URL for its lifetime (screen/URL sharing is not preventable by any web DRM-free setup).

# Operations runbook

Arc is the only authority for money, stage and access rights. Arkiv, Swarm, Mux and Postgres are caches or delivery layers; losing one never changes funds.

## Publication workflow (creator → Arc → Arkiv)
States are journalled in Postgres per creator + operation: `prepared → swarm → arc deployed → registered → arkiv listed`.
- **Browser closed mid-flow:** reopen `/create` with the same wallet; the stored record resumes (no redeploy). "Start a new film instead" sets it aside; set-aside films have "Resume this one".
- **Arc tx sent but no receipt seen:** the reconciler finds the campaign by tx/event; never redeploy.
- **Arkiv slot stuck `publishing`:** make sure the wallet has tGLM on Rabdi, then retry; the backend resets an unsent slot after 120 s (`retry: true`) and adopts already-journalled entity ids.

## Owner-only Arkiv renewal
Creator dashboard → Renew listing (wallet must be the entity owner, needs tGLM). An expired listing only hides the film from discovery; its page works by direct link.

## Swarm
- Check `curl $SWARM_BEE_URL/health` and `/readiness`; postage batch TTL via `/stamps`. Expired batch → buy/extend, then re-upload only if bytes are missing (references are content-addressed and committed on Arc).
- Always upload with redundancy level 0 (see `arkiv/swarm.md`).

## Video (Mux)
Release upload → probe → `configureRelease`. Playback uses signed tokens issued only after the wallet owns access on Arc. If processing fails the film cannot be published; re-upload and re-select. Rotate `MUX_SIGNING_*` if a token key leaks.

## Metered viewing
Design and trust boundary: `docs/pay-per-view.md`. Needs `METER_PRIVATE_KEY` funded with Arc gas, `configureMeterSigner` on the factory **before** campaigns are created (campaigns capture the signer; earlier ones stay full-purchase only), and the settlement worker: `npm run viewing:settle:watch -w @cinevest/backend` runs every 5 minutes as a long-running process, on the same kind of host as the CRE runner, and `npm run viewing:settle -w @cinevest/backend` runs one pass for an external scheduler. A factory accepts `configureMeterSigner` only once, so losing the key means a new factory. If it stops for longer than the 6-hour exit delay, exiting viewers keep unsettled usage; viewer funds are never at risk from the outage. Metered bytes flow through the backend, so size bandwidth accordingly.

## World ID (retired)
Not used by the active build (`docs/cre.md`); kept for legacy World-gated contracts. Env: `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_ACTION`, `WORLD_RP_SIGNING_KEY`, verifier key. The verifier signer is configured once on the factory (`configureWorldVerifierSigner`); a new factory needs it again.

## RPC outages
Public Arc RPC rate-limits and rejects batches; clients retry with backoff. If down, funding/claims pause; nothing is lost. Discovery marks films "temporarily unverifiable" instead of showing unchecked data.

## Recover one failed campaign
1. Find the Arc address from the creator dashboard or journal. 2. Confirm it is in the factory registry. 3. Re-run the missing step (register, Arkiv list, renew) — never redeploy. 4. If Swarm bytes are missing, re-upload the identical file and verify the digest.

## Creator form notes
- A stored unfinished publication locks the finance inputs until it is resumed or set aside. "Start a new film instead" clears both steps; set-aside films stay resumable from the list below the form.
- The pitch field is capped at 2,000 characters in the UI (the backend allows more); film pages clamp long pitches with "Read more".

## Structured logs
Backend log lines are single JSON objects (`apps/backend/lib/log.ts`) with `ts`, `level`, `event`, `op` (journal operation id), `campaign`, `provider` and `latencyMs` where available. Secret-looking fields (token, key, signature, proof, nullifier, cookie, authorization) are replaced with `[redacted]`. Search by `op` or `campaign` to trace one failed publication through `publication.reconciled` / `publication.reconcile_failed`.

## Claim trace on a public RPC
`node scripts/claim-trace.mjs <campaign> out.json` needs a large `eth_getLogs` range and historical state. The public Arc RPC rejects ranges over a few blocks and rate-limits, so use an archive-capable RPC, `FROM_BLOCK` at the deployment block and `CHUNK` (blocks per request) to fit the provider limit.

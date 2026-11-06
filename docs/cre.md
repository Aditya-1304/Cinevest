# Chainlink CRE release review

Cinevest targets ETHGlobal Mumbai's **Best workflow with CRE** prize ($1,500).
The published requirements accept a successful CRE CLI simulation combining a
blockchain and an external system, meaningfully integrated into the app:
https://ethglobal.com/events/mumbai/prizes/chainlink

Active sponsor selection is Arc, Arkiv and Chainlink, replacing World.
Mux remains the media provider. CRE checks delivery readiness; it does not provide
proof of humanity, judge film quality, or replace the independent reviewer.

## Start locally

From the repository root:

```sh
npm ci --prefix cre
npm run cre:typecheck
npm run cre:build
cp cre/.env.example cre/.env
```

Install the official CRE CLI following
https://docs.chain.link/cre/getting-started/cli-installation/macos-linux.
This checkout also has a locally downloaded CLI at `.tools/bin/cre` (v1.39.0),
verified against the release's published SHA-256 checksum. The binary is ignored
by Git; install it separately on other machines.

```sh
./.tools/bin/cre login
./.tools/bin/cre workflow supported-chains
```

Create the account at https://app.chain.link/cre/discover. Login and verify that
`arc-testnet` is enabled for your organization. Local simulation does not require
CRE network deployment access. The SDK is pinned to 1.23.0.

Configure `cre/.env` privately:

- `CRE_BIN`: absolute path to the CLI, or `cre` if available on PATH.
- `CRE_RUNNER_SECRET`: a securely generated secret of at least 32 characters.
- `MUX_CRE_TOKEN_ID`, `MUX_CRE_TOKEN_SECRET`: separate Mux token with Video
  **read-only** permissions. The runner derives the HTTP Basic authorization secret;
  no Mux playback signing key or blockchain signing key is used by this workflow.

Set the **same** `CRE_RUNNER_SECRET` in `apps/backend/.env.local`, alongside:

```dotenv
CRE_RUNNER_URL=http://127.0.0.1:2020/verify
```

Then run the runner and the existing app in separate terminals:

```sh
npm run cre:runner
npm run dev
```

The runner is a long-running Node service, not a Vercel function. For a hosted
backend, run it on a separate host behind HTTPS and set `CRE_RUNNER_URL` to that
host's `/verify` endpoint. Default binding is loopback; set `CRE_RUNNER_HOST`
only when configuring a protected reverse proxy. Never expose plain HTTP publicly.
The backend allows plain HTTP only for loopback development.

The existing deployment manifest must match the deployed factory before the
backend accepts Arc reads. A stale `compatible=false` manifest is a separate
deployment blocker; this integration does not silently disable that protection.

## Application flow

1. The creator selects a Mux release through the existing signed-only selection
   flow and configures its playback commitment on Arc.
2. In the final milestone panel, the creator, configured reviewer or committee
   signer signs into the existing SIWE session and requests the CRE release check.
3. The backend resolves the selected upload privately and creates a fresh request
   bound to campaign, factory, asset, evidence hash, playback commitment and one
   Arc block number/hash. It sends this to the authenticated runner.
4. The runner invokes the actual `cre workflow simulate` CLI with a private
   temporary payload. The native CRE EVM capability reads the campaign and registry
   at that block. The HTTP capability calls Mux directly using CRE secrets.
5. CRE checks registered identity, Production stage, previous milestone eligibility,
   unchanged/non-rejected evidence, absence of pending disputes, playback commitment,
   Mux processing readiness and signed-only playback IDs. It also previews the
   exact `approveStage(2, evidenceHash)` call with `eth_call` from the configured
   reviewer. This does not submit a transaction or verify committee signatures.
6. The runner accepts only one strictly validated, redacted report. The backend
   checks its nonce, bindings, expiry, proposed calldata and boolean outcome,
   rechecks the Arc block/evidence/commitment, and performs the existing live
   playback-access probes. A superseded database selection is rejected.
7. The UI displays the checks and provides a redacted JSON download. Final
   approval rechecks CRE and requires the report's evidence hash to match the
   exact evidence being approved. The reviewer still authorizes the transaction.

Threshold committee signers can inspect/download the same report. Their final
transaction still uses the existing threshold-signature workflow; CRE never supplies
a committee signature. See `scripts/PHASE12.md` for the committee tools.

## Boundaries

This is **trusted local CRE simulation infrastructure**, not a deployed DON or a
production oracle. CLI execution makes live Arc and Mux requests. The runner
operator, backend, configured RPC and Mux remain trust dependencies.
The normal HTTP capability does not provide enclave-only credential confidentiality.

The report is an authenticated runner response, not a publicly verifiable CRE
cryptographic attestation. Offline JSON downloads are review/demo evidence.
The backend rejects report substitution and stale bindings, but the current
contracts still trust their immutable reviewer; an authorized reviewer using a
different client can bypass this offchain UI gate. Contract-enforced CRE reports
would require an explicitly designed receiver and new deployments.

No escrow authority or contract ABI changed. A rejected or unavailable report
does not approve a milestone, publish a film or transfer money.
The runner never uses `--broadcast`. Its private payloads are mode 0600 and
removed after execution. It bounds request size, output size, runtime and
concurrency. Authentication uses a timing-safe shared-secret comparison.
Private simulator stdout/stderr and provider exceptions are not returned to users.
Do not publish raw CLI diagnostics; use the redacted report.

World endpoints now return HTTP 410 and no longer issue funding permissions.
New campaigns already use `worldGated=false`; legacy immutable World gates remain
enforced onchain and cannot be converted by a frontend change. Paid viewing
continues to follow contract access rules without an unrelated World UI block.
Historical World libraries and contract interfaces remain for existing artifacts;
their presence is not an active World sponsor submission.

## Verification status

The workflow typechecks and compiles to WASM with the real CRE SDK and CLI.
Application build/typecheck and focused lint are recorded separately from live
acceptance. No test suites or test files were added/run for this integration.

Live acceptance requires CLI login, tenant Arc availability, a Mux read-only
credential, a configured authenticated runner and a compatible campaign deployment.
Until those are available, no successful end-to-end CRE simulation is claimed.

The pinned CRE SDK brings an upstream Zod 3 dependency advisory reported by
`npm audit`. Application/protocol validation uses patched Zod 4; runner inputs are
bounded and the workflow accepts a fixed schema. No incompatible forced dependency
override was applied. Review the upstream SDK update before production use.

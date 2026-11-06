# Backend and contract verification through Phase 7

Scope: `Cinevest_TECH_SPEC_AND_BUILD_PLAN_UPDATED.md`, backend and contracts only.
No frontend files were edited. Phase 6 UI acceptance remains with the frontend
teammate; Phase 8 SIWE/Livepeer and Phase 9 World enforcement are outside this work.

## Verified locally

| Area | Evidence |
| --- | --- |
| Contract lifecycle and accounting | 142 Foundry tests passed, zero failed/skipped |
| Stateful safety | 128 runs, 8,192 handler calls, zero handler reverts; handler-only targeting |
| ERC-20 callbacks | Incoming funding/viewing and outgoing refund/tranche/revenue reentrancy tests passed |
| Funding and revenue fuzzing | 256 runs per fuzz case, including refund order, exact expiry and cap allocation |
| Reference economics | $100 principal, $2 viewing, 20% share, 1.5× aggregate cap; view 375 reaches the cap |
| Purchase gas | Same measured call cost for one and 100 backers; see `contract-gas-report.md` |
| Backend behavior | 43 Node test cases passed, including PostgreSQL migrations and actual Drizzle CAS updates |
| API boundary | 10 HTTP smoke checks passed against the built server |
| Build | Backend production build and TypeScript checks passed |
| Static checks | Backend/shared ABI ESLint passed with zero rule warnings/errors; Git whitespace check passed |
| Shared ABI | JSON and literal TypeScript ABIs match Foundry artifacts; testnet assertions passed |

The root ESLint Next.js plugin emits a repository-level pages-directory discovery
notice because this service uses App Router inside a workspace. This is not a
lint rule failure. No frontend lint/build result is claimed here.

## Verified against live providers

The new isolated Cinevest Neon database was provisioned in the existing account.
All four Drizzle migrations were applied. A real atomic update race admitted one
writer and rejected the other; its synthetic workflow was removed afterward.
Connection values are saved only in the ignored, mode-0600 backend environment
file. No credentials appear in these reports.

Arc Testnet chain identity and the native-USDC ERC-20 interface's six decimals
were checked. Arkiv Rabdi chain identity and an actual named-schema read succeeded
through its public endpoint. That read returned no Cinevest listing; it does not
prove a creator-signed write or renewal has occurred.

Raw credential-free outcomes are in `backend-live-verification.json` and
`backend-api-smoke.json`. They are point-in-time evidence, not ongoing monitoring.

## Deployment and user acceptance update

The replacement factory signature is confirmed. The active factory is
`0x79262f3ebc9f2031e26d9df5222ed205c8fe0563` on Arc Testnet, deployed from the
specified wallet. Its creation-bytecode fingerprint matches the compiled revision
and its live runtime matches the deployment manifest. Shared exports report
`compatible: true`. The backend production build was refreshed after deployment.
The previous factory manifest is preserved under `contracts/deployments/history`.

The user reports that the remaining flows work. This is recorded as user-provided
acceptance, separately from automated verification. In this checkout, the Swarm
uploader/gateway/postage environment values remain unset and the automated Arkiv
read returns no Cinevest listing. Public Swarm upload/read-back, creator-owned
Rabdi publication, and renewal therefore remain user-reported rather than
independently reproduced by the agent. The live report retains these distinctions.

The implementation, verification commands, recovery paths and frontend API
handoff are documented in `apps/backend/README.md`.

# Cinevest

Hackathon scaffold for the accompanying technical specification. Testnets only.

## Quick start

Requires Node.js 22.9+ and npm.

```sh
npm install
cp apps/web/.env.example apps/web/.env.local
cp apps/backend/.env.example apps/backend/.env.local
npm run dev
```

Web: http://localhost:3000. Backend: http://localhost:3001. The web app proxies `/api/*` to the backend using server-only `BACKEND_URL`; set this to the deployed backend URL on Vercel. Deploy each app with its own root directory and retain workspace dependencies.

## Workspace

- `apps/web`: Next.js App Router, Tailwind CSS 4, shadcn-compatible UI, wagmi/viem and the CRE release-review UI. Add components with `npx shadcn@latest add <component>` from this directory.
- `apps/backend`: Next.js route handlers; Arkiv SDK, SIWE, JOSE and Postgres dependencies. Mux and Bee integrations use server-side credentials.
- `contracts`: Foundry configuration. Create the Arc Studio starting project before importing contracts here, as required by the spec. Install Foundry separately, then use `npm run contracts:build` and `npm run contracts:test`.
- `packages/abi`: reserved for generated contract ABIs; no fabricated contract interface.
- `arkiv`: Arkiv schema and sponsor criterion files (`schema.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md`, `friction.md`, `swarm.md`).
- `docs`: operations [runbook](docs/runbook.md), Swarm node guide, Phase 8 and World docs.

`npm run typecheck`, `npm run lint`, and `npm run build` validate the TypeScript applications.

The governing build plan and per-phase evidence describe the implemented capabilities and remaining live acceptance. Health reports process availability only. Keep private credentials server-side. Never commit `.env.local`.

Before publishing, choose a license, review the specification and add required hackathon AI-use disclosures. Git initialization, commits, pushes and deployment remain user-controlled.

## Chainlink CRE + Mux release review

The active sponsor integration is Arc + Arkiv + Chainlink. CRE reads Arc campaign
state, queries Mux directly and previews final milestone approval before the human
reviewer signs. The UI exposes a redacted simulation report; no production-oracle
or proof-of-humanity claim is made.

See [CRE setup and trust boundaries](docs/cre.md). Run `npm ci --prefix cre`,
`npm run cre:build`, configure the private runner environment, then run
`npm run cre:runner` alongside `npm run dev`.

World verification endpoints are retired. Existing World-gated contracts retain
their immutable restrictions; new campaigns use public funding.

## Pay-per-view metering

Viewers can deposit refundable USDC and pay only for what they watch, capped at the full price. See [docs/pay-per-view.md](docs/pay-per-view.md).

## Architecture

Arc Testnet (USDC) settles funding, milestones and access purchases in the Campaign/CampaignFactory contracts. The creator's wallet lists a film on Arkiv (Rabdi); pitch, poster and evidence bytes live on Swarm with digests committed on Arc; Mux serves the paywalled film through signed playback tokens issued only after on-chain purchase; Postgres holds the journal and wallet sessions; Chainlink CRE checks Arc and Mux before final review. See [arkiv/schema.md](arkiv/schema.md).

## Sponsor integrations

- **Arc:** factory `0x503ccf5a1d873d91e8581042aea002e02f027cd8` (manifest: `contracts/deployments/arc-testnet.json`).
- **Arkiv + Swarm:** see the `arkiv/` files.
- **Chainlink CRE:** Arc + Mux release-readiness workflow; see `docs/cre.md`.

## Environment

Copy the `.env.example` files, then fill `apps/backend/.env.local` (database, Arc RPC, Swarm, session secret, Mux, Arkiv key, CRE runner) and `cre/.env` (private runner settings). Never commit them.

## Demo flows

`/demo` has a guided walkthrough and the Circle faucet link. Roles: a creator wallet, a backer wallet and a reviewer wallet (use your own test wallets; no keys are published).

## AI disclosure

This project was built with AI coding assistance (Claude, plus other models under human review). All code was reviewed and verified by the team against live testnets.

## Creator form

`/create` has two steps: the film proposal (title, genre, pitch up to 2,000 characters, independent reviewer, poster, rights notice) and the finance terms, with public funding. Legacy World settings are disabled because the active integration uses CRE. Form controls use shadcn-style `Input`, `Textarea` and `Label` from `apps/web/src/components/ui`, which also style the native poster file picker. The form grows with its content, resets to an empty form after a film is published or set aside ("Create another film" / "Start a new film instead"), and long pitches are clamped with "Read more" on film pages. Non-landing pages use a faint grid backdrop; the landing page keeps its own.

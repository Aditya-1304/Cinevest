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
- `arkiv`: reserved for schema and integration evidence.

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

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

- `apps/web`: Next.js App Router, Tailwind CSS 4, shadcn-compatible UI, wagmi/viem and World IDKit dependencies. Add components with `npx shadcn@latest add <component>` from this directory.
- `apps/backend`: Next.js route handlers; Arkiv SDK, SIWE, JOSE and Postgres dependencies. Livepeer and Bee integrations can use server-side fetch.
- `contracts`: Foundry configuration. Create the Arc Studio starting project before importing contracts here, as required by the spec. Install Foundry separately, then use `npm run contracts:build` and `npm run contracts:test`.
- `packages/abi`: reserved for generated contract ABIs; no fabricated contract interface.
- `arkiv`: reserved for schema and integration evidence.

`npm run typecheck`, `npm run lint`, and `npm run build` validate the TypeScript applications.

The governing build plan and per-phase evidence describe the implemented capabilities and remaining live acceptance. Health reports process availability only. Keep private credentials server-side. Never commit `.env.local`.

Before publishing, choose a license, review the specification and add required hackathon AI-use disclosures. Git initialization, commits, pushes and deployment remain user-controlled.

## World ID fair funding

Phase 9 code now includes server-side proof verification, durable EIP-712 funding
permissions and the gated contribution UI. See [implementation and activation](docs/world/phase-9-completion.md)
and the [World integration debrief](docs/world/debrief.md). Live World proof and
matching-deployment acceptance remain outstanding; incompatible funding is disabled.

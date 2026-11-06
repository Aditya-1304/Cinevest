# Swarm usage

What is stored: the poster image and the pitch manifest (`pitchSwarmRef`, `posterSwarmRef`) plus milestone evidence files. Their digests are committed in the Arc terms, so the backend refuses bytes that do not match.

## Requirements
- A Bee node (Docker: `docker compose up -d bee`, see `docs/swarm-node.md`), funded wallet and a usable **postage batch** (`SWARM_POSTAGE_BATCH_ID` in `apps/backend/.env.local`).
- `SWARM_BEE_URL` (default `http://127.0.0.1:1633`) and `SWARM_GATEWAY_URL` for reads.

## Upload and read
1. Creator posts the poster in `/create`; the backend uploads to Bee `/bytes` with `swarm-redundancy-level: 0` (bee-js' default erasure coding changes the root for files over 4 KB and broke references).
2. The returned reference (`0x…`) is journalled, committed in Arc terms and written to Arkiv.
3. Read: `GET <gateway>/bytes/<ref>` or the app's `/api/swarm/*` proxy, which re-checks the digest.

## Friction
- Postage batches expire; extend or buy a new one before demos (`docs/swarm-node.md`).
- The erasure-coding default mismatch above.
- Demo timestamp: record when you run the final demo; references in the README must open independently via the gateway.

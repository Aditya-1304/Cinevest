# How Cinevest uses Arkiv

1. **Write** — after the Arc campaign exists, the creator's wallet creates a `Cinevest.film.v1` entity on Rabdi (`apps/web/src/lib/arkiv-creator.ts`, `publishCreatorListing`). The browser reaches Rabdi through `/api/arkiv-rpc`, so no access key ships to the client.
2. **Journal** — the publication workflow records the entity key/tx so a lost confirmation is reconciled instead of duplicated (`apps/backend/lib/workflows/publication.ts`).
3. **Read** — the backend `/films` route queries by filter, then verifies each hit against Arc (`query-films.ts`, `arc-snapshot.ts`).
4. **Renew** — owner-only extension (`/api/listings/extend`).
5. **Independent view** — `/explorer` and the portable manifest viewer read Arkiv and Swarm directly.

Arkiv is a cache of intent, never an authority: Arc settles, Arkiv advertises.

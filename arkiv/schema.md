# Arkiv schema — `Cinevest.film.v1`

Source of truth: `apps/backend/lib/arkiv/film-schema.ts`. Network: Arkiv Rabdi testnet (chain 7794095).

| Attribute | Type | Indexed | Meaning |
|---|---|---|---|
| `arcChainId` | u64 | no | Settlement chain (Arc Testnet, 5042002) |
| `campaignAddress` | address | yes | Campaign contract on Arc |
| `creatorAddress` | address | yes | Creator wallet; also the entity owner |
| `genre` | string | yes | Discovery filter |
| `fundingDeadline` | u64 | yes | Unix time; lets clients hide closed campaigns |
| `title` | string | no | Display title |
| `pitchSwarmRef` | string | no | Swarm reference of the pitch manifest |
| `posterSwarmRef` | string | no | Swarm reference of the poster |
| `termsDigest` | string | no | Digest of the Arc terms, checked against the contract |
| `operationDigest` | string | yes (optional) | Ties the entity to one publication journal operation |
| `createdAt` | u64 | no | Creation time |
| `schemaVersion` | u64 | no | Currently 1 |

## Writer, owner and expiry

- The **creator's own wallet** writes and owns the entity, signing on Rabdi in the browser (needs tGLM). The backend never holds a creator key.
- Entities expire. Only the owner can extend them (`/api/listings/extend`, "Renew listing" in the creator dashboard). Expiry removes the *listing* only; the campaign, funds and entitlements stay on Arc.
- A listing is trusted only after the backend re-reads the Arc campaign and checks `campaignAddress`, `creatorAddress`, `termsDigest` and the factory registry (`verify-entity.ts`, `candidate-validation.ts`). A forged entity is dropped.

## Live query

Implemented in `apps/backend/lib/arkiv/query-films.ts`: filter by schema type, optionally `genre` (equality) and `owner` (`ownedBy`), `fundingDeadline > now`, ordered by creation, paged with `offset`.

Try it: open `/discover` (genre filter), or `/explorer` for the read-only cross-creator view that needs no Cinevest database.

Reproduce the current listing for a campaign: `GET /films` on the backend (port 3001) and find the entry whose `campaignAddress` matches; the film page shows "Listed on Arkiv" with remaining days.

# Why Arkiv

Cinevest needs a **public, creator-owned, expiring discovery index** that is separate from money.

- Money and access rights live on Arc and never depend on a listing.
- Discovery must work with no Cinevest SQL table: `/explorer` queries Arkiv directly and the backend only enforces the Arc cross-check.
- Creators own and renew their listing from their own wallet; a stale listing disappears by itself, which keeps the feed honest.

Proof it works (real testnet, not a claim): films published through the UI on Rabdi appear in a fresh browser on `/discover` and `/explorer`; entity transactions are visible on `https://rabdi.explorer.arkiv.network`. A listing that fails the Arc check is shown as unverified or dropped.

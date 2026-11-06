Run publication recovery from the repository root with Node 26:

```sh
node --conditions=react-server apps/backend/scripts/reconcile-publications.mjs 20
```

The optional limit is 1–100 operations (default 20). Configuration loads from
`apps/backend/.env.local`; `DATABASE_URL` and the configured provider endpoints
must be available. Run manually, without another recovery worker writing the same
operations. Atomic journal transitions reject concurrent state changes.

The command checks stored Arc hashes and looks up existing creator-owned Arkiv
entities. It never submits deployment or publication transactions. Operations
without a stored transaction remain pending for the creator to resume. A failed
provider check reports the operation ID and sets a nonzero exit status.

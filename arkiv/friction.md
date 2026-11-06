# Arkiv friction (observed while building)

- **Funding the writer:** creators need tGLM on Rabdi before listing. First attempt with no tGLM left the journal slot stuck in `publishing`; we added a tGLM pre-check, a clearer message and an owner-safe `retry` path.
- **Explorer lag:** a new entity can show "not found" on the Rabdi explorer for a while even though the chain has it; the app reads the chain, not the explorer.
- **Access key in the browser:** the SDK expects a key client-side; we proxy through `/api/arkiv-rpc` with a placeholder key.
- **Chain switching:** after the Rabdi write the wallet must switch back to Arc before the next Arc signature; we poll until wagmi sees it.
- **Rate limits** on the companion Arc RPC (not Arkiv) caused discovery to drop films; fixed with retries and lower concurrency.
- Feature wish: a first-class "extend by owner" in the explorer UI.

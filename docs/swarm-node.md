# Local Swarm Bee node (testnet)

Run the same Swarm Bee node the backend upload pipeline uses, with one command. Testnet only.

## 1. Start the node

```bash
cp .env.example .env
# edit .env and set BEE_PASSWORD to any password you choose
docker compose up -d bee
```

## 2. Check it is up

```bash
curl http://127.0.0.1:1633/health
curl http://127.0.0.1:1633/readiness
curl http://127.0.0.1:1633/wallet
```

## 3. Fund the new wallet

A new node has its own wallet. Read `walletAddress` from `/wallet` and send it:

- Sepolia ETH (for gas)
- Sepolia sBZZ (for postage stamps)

## 4. Buy a postage batch

`<amount>` is the per-chunk balance in PLUR, which sets how long the batch lives; `<depth>` sets its capacity. Example that lasted about two days in our test:

```bash
curl -X POST http://127.0.0.1:1633/stamps/1757754000/17
```

Stamps take some minutes to become usable. Confirm the batch shows `usable: true` in:

```bash
curl http://127.0.0.1:1633/stamps
```

## 5. Point the backend at it

In `apps/backend/.env.local` set:

```
SWARM_BEE_URL=http://127.0.0.1:1633
SWARM_GATEWAY_URL=http://127.0.0.1:1633
SWARM_POSTAGE_BATCH_ID=<batchID from step 4>
```

Then verify the backend gets a healthy response from `GET /api/swarm/health`.

## Notes

- A postage batch has a limited lifetime. Top it up before it expires: `curl -X PATCH http://127.0.0.1:1633/stamps/topup/<batchID>/<amount>`.
- Never commit `.env` or the node's wallet data.
- The node is testnet only. Do not point it at mainnet.

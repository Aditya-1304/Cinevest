# Pay-per-view metering

A viewer can pay for what they watch instead of buying the whole film. Unused money stays theirs.

## Flow

1. The viewer deposits refundable USDC with `depositViewing`. Deposits plus charges cannot exceed `watchPrice`.
2. `POST /api/viewing/session` opens the wallet's single session. A new tab or device takes over.
3. The player loads a gateway manifest. Every URI points at `/api/viewing/media/...`.
4. Each segment request reserves its content blocks against funded escrow, or is refused.
5. Heartbeats report the content that played. Reported blocks become final charges.
6. `npm run viewing:settle` posts cumulative receipts to Arc through `settleViewing`. Only then does money enter the revenue waterfall.
7. The viewer leaves through a closing receipt (instant) or `requestViewingExit` then `withdrawViewing` (6 hours, no backend needed).

## Why a gateway rather than Mux tokens

Mux instant clipping trims manifests. Mux does not document enforcement against direct segment requests, static MP4s are not bounded by it, and an expired token stops playback that has already started. Viewers therefore never receive a Mux URL or token: the backend holds them and releases segments one at a time. The cost is that metered video bytes pass through the backend. Viewers with full access still stream from Mux directly.

## Billing rules

The film is divided into 5-second content blocks, and a started block counts as used. The cumulative charge for `n` of `N` blocks is `ceil(price * n / N)`, so all blocks cost exactly the full price.

| Situation | Result |
|---|---|
| Pause or buffering | No charge |
| Seek forward | Skipped content is not charged |
| Replay | Paid blocks are free |
| Resume later | Paid blocks and position are kept |
| 2x speed | Charged by content consumed |
| Second tab or device | Takes over; the earlier session stops |
| All blocks paid | Equals the full price; settlement grants `hasAccess` |
| `buyAccess` after metering | Pays only `watchPrice` minus settled charges |

Limits in `apps/backend/lib/viewing/ledger.ts`:

- `MAX_RESERVED_BLOCKS` (60 seconds): how far delivery can run ahead of reported playback.
- `GRACE_BLOCKS` (5 minutes): delivered but unreported content that stays free. Beyond this it is charged, so a client that never reports gets at most this much free. Reporting those blocks later restores the allowance.

## Accounting

On Arc, per wallet: `deposits = balance + metered charges + withdrawals`. `reservedUSDC()` includes `viewingEscrow`, so escrow is never treated as revenue. Reserved amounts exist only in the ledger: for a wallet, `funded = balance + charged` and delivery requires `price(watched + reserved) <= funded`.

Receipts are cumulative and bind the wallet, campaign, film hash, session, sequence, spend cap and deadline. Replays revert on sequence, and an older figure charges nothing. A receipt charges at most the remaining balance.

Exit races: new delivery stops within the 90-second lease once a heartbeat sees an exit. While a closing receipt is live, no new session opens. A deposit cancels a pending exit, so it cannot shorten the settlement window.

## Trust boundary

- The meter is trusted to report usage accurately. A signature authenticates its report, not that anyone watched.
- A compromised `METER_PRIVATE_KEY` can charge viewers up to their deposited escrow, and nothing more.
- A client can under-report by up to the grace allowance. Delivered video can be copied.
- Delayed settlement credits revenue under the waterfall state at settlement time, not at viewing time.

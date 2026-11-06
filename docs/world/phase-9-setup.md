# World ID: P9.0a–P9.3

Current integration and live acceptance status: [Phase 9 handoff](phase-9-completion.md).

P9.4–P9.7a follow-up: see [verification implementation and evidence](phase-9-verification.md).

## Integration and scope evidence

The implementation uses official IDKit 4.6.0, v4 uniqueness requests, the
`proofOfHuman` preset and `allow_legacy_proofs=false`. Legacy v3 and session
responses are rejected by the context boundary. RP signing runs only in the
backend's `server-only` module through `@worldcoin/idkit-core/signing`.

No real staging proof has been collected. Same-human/two-wallet and fresh-challenge
nullifier stability are **unverified**. Current SDK types describe the v4 nullifier
as RP-scoped; do not assume action-scoped uniqueness from its name or mix raw v3/v4
nullifiers. Before P9.4–P9.8, record the actual response protocol, credential,
nullifier, action and environment for this matrix (never record proof secrets):

| Identity | Wallet | Campaign | Challenge | Required observation |
| --- | --- | --- | --- | --- |
| A | 1 | X | fresh 1 | v4 human proof and matching signal |
| A | 2 | X | fresh 2 | stable underlying identity; changed wallet signal |
| A | 1 | X | fresh 3 | stable underlying identity; changed nonce signal |
| A | 1 | Y | fresh 4 | campaign namespace differs regardless of raw nullifier scope |
| B | 1 | X | fresh 5 | different underlying identity |

The proposed storage key is `(chainId, campaign, scopedNullifierHash)` where
`scopedNullifierHash = keccak256(abi.encode(rpId, uint256(issuerSchemaId), uint256(rawNullifier)))`.
The first field is a Solidity string; both numeric fields are uint256. The
campaign is a separate key column, never the wallet or fresh nonce. Confirm this
policy with staging evidence before implementing identity ownership or issuing
permissions. P9.0a's allowed limitation-disclosure path applies here.

## Portal and local setup

1. Configure an official World app and RP in the Developer Portal. Set backend
   `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ACTION`,
   `WORLD_ENVIRONMENT=staging`, `SESSION_SECRET` and `APP_URL`.
2. `WORLD_ACTION` is a stable prefix. Each campaign uses
   `prefix:chainId:lowercaseCampaignAddress`; ensure that exact action is permitted
   by the portal configuration. Dynamic action acceptance is not live-validated.
   Do not substitute an action containing wallet or nonce.
3. Start the existing web and backend services with `npm run dev`, connect a wallet,
   and open `/world/5042002/<campaign-address>`. Sign in with SIWE and open IDKit.
   Use World's staging simulator for the matrix above. A staging identity is not
   evidence of real human uniqueness. No fake successful verification is provided.
4. The page collects a proof and checks its context on the backend. It explicitly
   stops before cryptographic acceptance. It never grants funding permission.
   Portal provisioning and the browser/simulator flow remain operator prerequisites;
   no widget-opening evidence is claimed from a build.

`POST /api/world/challenge` accepts only `{arcChainId, campaignAddress}`. Wallet is
always taken from the signed SIWE session. It returns a five-minute signed JWT,
RP context and signal. Signal encoding is exactly:
`cinevest:world:v1:chainId:lowercaseCampaign:lowercaseSiweWallet:rpNonce`.
The RP signature authenticates action, nonce and timestamps; the JWT separately
protects wallet, campaign, signal, environment and expiry. RP signatures alone do
not bind the wallet signal.

`POST /api/world/context` accepts `{token, proof}`. It checks JWT signature and
expiry, current SIWE wallet, v4 uniqueness protocol, expected action/environment,
RP nonce, exactly one human credential and the official `hashSignal(signal)`.
It returns `{contextValidated:true, verified:false}` only. A second SIWE wallet
cannot use the first wallet's token. Editing the token breaks its signature;
editing the proof signal hash fails context validation. These are implementation
properties from static review, not executed substitution-test evidence. This diagnostic route does not persist or consume proofs. The implemented
`/api/world/verify` route performs the provider call and atomic consumption; see
the follow-up for its separate acceptance boundary.

## EIP-712 authorization contract (P9.0b)

The RP signer authenticates World requests. A **separate** `worldVerifierSigner`
authorizes campaign funding. Create a fresh backend-controlled secp256k1 key per
deployment environment, preferably held by a managed signer. Never reuse the RP,
deployer, session or fixture key. The factory captures its nonzero public address when creating a gated campaign;
the campaign signer is immutable. The implemented factory allows its deployment
administrator to configure this separate signer exactly once. Gated creation
reverts until configuration is complete. A signer
compromise requires stopping issuance and migrating to new campaigns; silent
signer replacement is outside this policy.

Domain fields, in order: `string name = CinevestWorldAuthorization`,
`string version = 1`, `uint256 chainId = actual execution chain ID`,
`address verifyingContract = campaign address`.

Primary type (exact bytes):
`WorldAuthorization(address wallet,address campaign,bytes32 scopedNullifierHash,bytes32 nonce,uint256 deadline)`.

Use standard `abi.encode`, never packed struct encoding. Struct hash is
`keccak256(abi.encode(TYPEHASH,wallet,campaign,scopedNullifierHash,nonce,deadline))`.
Digest is `keccak256(abi.encodePacked(hex"1901",domainSeparator,structHash))`.
Solidity must use OpenZeppelin EIP712 and ECDSA with canonical low-s signatures.
The TypeScript encoding is in `apps/backend/lib/world/authorization.ts`; it does
not sign or issue permissions. `authorization-vector.json` contains a deterministic
public-key fixture, full typed data, both intermediate hashes, digest and signature.

P9.7a now exercises this public TypeScript fixture through the actual Solidity
campaign digest implementation and verifies `ECDSA.recover(digest, signature) ==
signer`. The focused check passes, closing P9.0b's local cross-language criterion.

Issuance policy: after verified proof and atomic challenge/identity binding, issue
a random bytes32 nonce and deadline no more than five minutes in the future (and
no later than proof credential expiry). Persist issuance per consumed challenge;
retries return the same valid permission (P9.8a). The contract requires
`wallet == msg.sender`, `campaign == address(this)`, `block.timestamp <= deadline`,
correct signer and unused digest. Consume the digest before any external transfer,
within the same reverting transaction as contribution accounting. Every funding
entrypoint must share this check. Reverted contributions roll back consumption.
A different domain, wallet, campaign, nonce, nullifier or deadline changes the
digest. The permission carries no amount: the cumulative per-human cap must be
enforced separately on chain in P9.7.

## Sources consulted

- https://docs.world.org/world-id/idkit/react
- https://docs.world.org/world-id/idkit/signatures
- Installed official 4.6.0 SDK declarations for result shapes and signal hashing.

## Evidence boundary

P9.1–P9.3 implementation is present. Real portal configuration, opening the widget,
staging scope behavior are not claimed. Local backend wallet-substitution and
Solidity signature fixture checks now pass in the follow-up. Existing deployed
contracts are unchanged; new source contracts require deployment before use.

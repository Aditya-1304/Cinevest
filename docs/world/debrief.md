# World ID integration debrief — Cinevest

Cinevest uses World ID to enforce fair film funding: one verified human binds to
one wallet within a campaign, and that human's cumulative principal cannot exceed
the campaign's immutable limit. Arc contracts enforce the final decision. A
successful widget interaction alone never grants permission to transfer funds.

The integration was built in three slices: request setup and wallet binding;
backend proof verification and contract enforcement; then durable authorization
issuance, recovery and funding UI. Engineering hours were not measured, so no
elapsed-time claim is made. The implementation uses official IDKit 4.6.0,
server-generated RP signatures and v4 human uniqueness proofs. A separate backend
key signs short-lived EIP-712 permissions for the exact Arc chain, campaign,
wallet and human nullifier. The permission is consumed by the contract once.

The main friction was the gap between proof collection and safe financial use.
The older scaffold used IDKit 2.x; the current flow requires RP context signing
and different response shapes. SDK declarations and API examples also describe
numeric fields differently, so the backend accepts bounded decimal and hex values
and forwards the original proof intact. Wallet authentication, World request
signing and funding authorization each serve a different purpose and need separate
binding and expiry checks.

Retries needed explicit application work. Verification atomically consumes the
challenge and records human ownership in PostgreSQL. Issuance then persists one
permission per challenge before returning it. A lost response can recover the
same valid permission; an expired permission requires a new proof. This avoids
turning a retry into a second financial authorization. Contract checks still
reject replay, wallet substitution, cross-chain/campaign use and cap overruns.

Useful improvements would be a maintained v4 staging fixture demonstrating
same-human/two-wallet behavior across fresh challenges, consistent numeric
encodings in SDK and API examples, and a complete financial-authorization example
covering durable retries and nonce consumption. The application also needs a
clear way to confirm that dynamically derived campaign actions are supported by
the configured portal policy. These are integration needs, not claims that World
provides an application-level payment or retry journal today.

Local evidence includes 154 passing contract checks, the TypeScript signature
fixture verified in Solidity, six backend proof/storage checks, and a local
concurrent issuance/recovery smoke check. Builds and typechecks pass. Real World
credentials and staging proofs were unavailable; the recorded Arc deployment is
older than the compiled Phase 9 code. Real nullifier-scope behavior, widget
completion and funded end-to-end acceptance therefore remain outstanding. Those
limits are explicit, and the application blocks incompatible or unauthorized
funding rather than reporting an unverified integration as live.

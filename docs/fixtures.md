# Testnet fixtures (Arc Testnet, chain 5042002)

Factory: `0x503ccf5a1d873d91e8581042aea002e02f027cd8` (deploy tx `0x5a95464aab0a0f8bbb7899fef7ff634fd73ae5699b2c2d0c100ae54bfbe45dcd`, block 71024966). Look transactions up in the Arc Testnet explorer.

## Failed campaign (P10.2)

Campaign `0x80E1B4c4359B0376A361E7919fEc9E02E7E9314c`: goal 10 USDC, funded 5 USDC by two wallets, deadline passed, `expire()` → Refundable, both wallets refunded. Distinct from the World-gated demo campaign below.

| Step | Tx |
|---|---|
| `expire()` | `0xd4d98fc9eb555c02206084dbcee6ab9795e416f63b79eccffa5d38f18b9213d5` |
| Refund wallet 1 `0x4106b2c95a3CBa73D74fd3DB19D8859cD674E9F6` (funded 2 USDC) | `0x42c7ad395fb7f2d1cf1553bda11f6a591df4229822eedfdb2492e2f9fadd6c62` |
| Refund wallet 2 `0xA81EA54966b554b1Cd9269fe2F688B5fE486159e` (funded 3 USDC) | `0x9431d70432361fdecfd25aef416b6f282f332c392c37fdb0e86dc3af46b87dcb` |

`refundsPaid() == 5000000` (exact principal). The wallets' on-chain USDC balance rises by slightly less than the refund because USDC is also Arc's gas token. Reproduce: create a campaign with a near deadline, fund below goal from two wallets, call `expire()` after the deadline, then each wallet calls `claimFundingRefund()`. The two refund wallets are throwaway keys kept outside the repo.

## World-gated campaign

`0xf9d1613c60E599945aE25A1345539971f490c060`: World-gated, 1 USDC per-human cap, verified first round of 1 human. Live verified funding and second-wallet denial are performed through `/world/5042002/<campaign>` with the staging simulator.

## Other evidence

Full publish → fund → evidence → release → paid playback runs were executed through the UI; see `docs/phase8-manual-verification.md`.

## Full lifecycle run (P10.5–P10.7)

Campaign `0x956560e4F6aC2798aa5F09A82DD5f74647daf514` on the current factory. Goal 5 USDC; two funders (2 and 3 USDC), an independent reviewer, the creator and one viewer. Every step is a real Arc Testnet transaction; after each state change `USDC.balanceOf(campaign) >= reservedUSDC()` was asserted.

| Step | Tx | Contract balance = reserved |
|---|---|---|
| createCampaign | `0xa993343b9f42c2b8d89c348aea1898cb6fb3845192e687c18cd508db45fca451` | – |
| contribute 2 USDC (funder 1 `0x4106…E9F6`) | `0x3a745652f7ec1e89e3afe9d90765353e9e0dd3ac1047eb2ac9c23b661b8f3238` | – |
| contribute 3 USDC (funder 2 `0xA81E…159e`) | `0x6a3db3b19e584829ae2bd3a86b380be81832bf65147d28b9120b5df2df33d109` | – |
| finalize → Production | `0x4165be838eb87d593e744cee7a42eef860f986408f317716f2de1976171da898` | 5.0 |
| Tranche 0 (30%) claimed | `0xabf56bb38b2ebdcfdbe15afbfad40d7e7eaa612f68d12d884a97550a3feed363` | – |
| Evidence 1 + reviewer approval + tranche 1 | `0xa4add92f…` / `0x954c85dd…` / `0x4c20fdd4…` | 1.5 (3.5 paid out) |
| configureRelease, evidence 2, approval, tranche 2 | `0x8e11d3da…` / `0x2888872c…` / `0x1941525b…` / `0x536dc651…` | 0.0 (all 5.0 paid out) |
| publishFilm → Released | `0xf8532f899b41a126f53b274fbe436412af0fb0b3f7f6300c253a05e1ed959f03` | – |
| Viewer buyAccess (1 USDC); `hasAccess` false → true | `0xe89f41340bf8a3b7d1c17708cef1eb3ba4e4af30b6cd6067cf7e1076677c2f45` | 1.0 |
| Funder revenue claims (0.32 + 0.48 USDC) | `0x42d08f04…` / `0xf089fa20…` | – |
| Creator revenue claim (0.20 USDC) | `0xf34ce7c5296eb823f18f0fffbf83d9038807e84b06f86845db4754c996bdf9de` | 0.0 |

Result: funders received exactly 80% of the purchase pro rata to their principal (2:3), the creator 20%, and the contract ended with zero balance and zero reserved, so `reservedUSDC` stayed solvent throughout. Unpaid access fails and paid access succeeds on-chain (`hasAccess`); the protected HLS playback that depends on it was verified through the UI (see `docs/phase8-manual-verification.md`).

## Cap crossing (P10.8)

Proven with a Foundry assertion rather than hundreds of live wallets: `test_ViewingCapCrossingAndComplementaryCreatorAllocation` in `contracts/test/CampaignViewing.t.sol` (all 154 Foundry tests pass).

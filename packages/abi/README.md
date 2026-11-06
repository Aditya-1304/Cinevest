# Shared contract interfaces

Both applications depend on `@cinevest/abi`. Import `campaignAbi`,
`campaignFactoryAbi`, and `erc20Abi` from that package for viem/wagmi clients.
Import `arcTestnetDeployment` for the confirmed factory address and chain ID.
These exports retain literal TypeScript types, including campaign term tuples.
For other tools and languages, use the JSON arrays in `abi/`, also exported as
`@cinevest/abi/Campaign.json`, `@cinevest/abi/CampaignFactory.json`, and
`@cinevest/abi/IERC20.json`.

Run `npm run contracts:abi` from the repository root after changing contracts.
This requires Foundry (`forge`) and Solidity 0.8.28. Never edit generated ABI files
by hand: the generator copies the compiled interfaces, including errors and events.

Run `npm run contracts:deploy:arc` after compilation. Open
http://localhost:8547 in a browser with MetaMask or Rabby, select the required
wallet shown on the page, and approve the factory deployment on Arc Testnet.
The wallet estimates the fee and signs locally. No private key is requested.
After RPC verification, the deployment is recorded in
`contracts/deployments/arc-testnet.json`. Keep the transaction hash if confirmation
is interrupted; the same browser also saves it locally for confirmation retries.

Deploy the factory once; create individual campaign instances through its
`createCampaign` method with the film's validated terms. Use `campaignAbi` with
each resulting campaign address and `campaignFactoryAbi` with the factory address.

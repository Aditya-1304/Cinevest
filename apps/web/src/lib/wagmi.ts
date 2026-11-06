import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { ARC_TESTNET } from "@/lib/chain";

// Minimal wagmi config for Arc Testnet.
export const wagmiConfig = createConfig({
  chains: [ARC_TESTNET],
  connectors: [injected()],
  ssr: true,
  transports: {
    [ARC_TESTNET.id]: http(),
  },
});

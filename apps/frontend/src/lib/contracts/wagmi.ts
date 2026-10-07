import { createConfig, http } from "wagmi";
import { hardhat, sepolia, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { contractAddresses, deployedChainId } from "./deployment";
import { abis as contractAbis } from "./abis";

/**
 * wagmi/viem configuration.
 *
 * The browser reads the deployed contracts directly. Nothing here writes patient data: the
 * contracts only ever hold pseudonymous identifiers, content hashes, consent state, permissions
 * and audit entries.
 */
export const chainById = {
  31337: hardhat,
  11155111: sepolia,
  1: mainnet,
}[deployedChainId];

export const rpcUrl =
  deployedChainId === 31337
    ? (import.meta.env.VITE_BLOCKCHAIN_RPC_URL as string | undefined) ?? "http://127.0.0.1:8545"
    : ((import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ?? "");

export const wagmiConfig = createConfig({
  chains: [chainById ?? hardhat],
  connectors: [injected()],
  transports: {
    [(chainById ?? hardhat).id]: http(rpcUrl || undefined),
  },
});

export const addresses = contractAddresses;
export const abis = contractAbis;

export const isLocalChain = deployedChainId === 31337;

export const explorerUrl = (hash: string): string | null => {
  if (!chainById?.blockExplorers?.default?.url) return null;
  return `${chainById.blockExplorers.default.url}/tx/${hash}`;
};

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

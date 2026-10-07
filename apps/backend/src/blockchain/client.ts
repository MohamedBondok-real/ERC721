import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { contractAbis } from "./abis.generated";

/* ------------------------------------------------------------------ */
/* Chain access                                                        */
/*                                                                     */
/* Every read and write in this file is a real JSON-RPC call. If the   */
/* node or the contract addresses are missing, callers get an explicit */
/* "not available" result — the API never invents chain data.          */
/* ------------------------------------------------------------------ */

export interface ContractAddresses {
  PatientRegistry: Address;
  ConsentManager: Address;
  MedicalRecordRegistry: Address;
  TreatmentRegistry: Address;
  AuditLog: Address;
}

export function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** Addresses from the environment, or null when any of them is missing. */
export function configuredAddresses(): ContractAddresses | null {
  const candidates = {
    PatientRegistry: env.PATIENT_REGISTRY_ADDRESS,
    ConsentManager: env.CONSENT_MANAGER_ADDRESS,
    MedicalRecordRegistry: env.MEDICAL_RECORD_REGISTRY_ADDRESS,
    TreatmentRegistry: env.TREATMENT_REGISTRY_ADDRESS,
    AuditLog: env.AUDIT_LOG_ADDRESS,
  };
  if (!Object.values(candidates).every(isAddress)) return null;
  return candidates as ContractAddresses;
}

/**
 * Chain metadata. Only the id matters for JSON-RPC calls, but viem requires the full
 * shape, so a minimal descriptor is built from the configured chain id.
 */
function targetChain(): Chain {
  return defineChain({
    id: env.BLOCKCHAIN_CHAIN_ID,
    name: `BreastCare chain ${env.BLOCKCHAIN_CHAIN_ID}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [env.BLOCKCHAIN_RPC_URL] } },
  });
}

let publicClient: PublicClient | null = null;
let walletClient: WalletClient | null = null;

export function getPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      transport: http(env.BLOCKCHAIN_RPC_URL, { timeout: 10_000, retryCount: 1 }),
      chain: targetChain(),
    });
  }
  return publicClient;
}

/** Wallet used by the backend relayer. Returns null when no operator key is configured. */
export function getOperatorWallet(): WalletClient | null {
  if (!env.BLOCKCHAIN_OPERATOR_KEY) return null;
  if (!walletClient) {
    const account = privateKeyToAccount(env.BLOCKCHAIN_OPERATOR_KEY as Hex);
    walletClient = createWalletClient({
      account,
      transport: http(env.BLOCKCHAIN_RPC_URL, { timeout: 15_000, retryCount: 1 }),
      chain: targetChain(),
    });
  }
  return walletClient;
}

export function operatorAddress(): Address | null {
  const wallet = getOperatorWallet();
  return wallet?.account ? (wallet.account.address as Address) : null;
}

export interface ChainStatus {
  configured: boolean;
  reachable: boolean;
  rpcUrl: string;
  chainId: number | null;
  blockNumber: number | null;
  operator: Address | null;
  addresses: ContractAddresses | null;
  missing: string[];
  error: string | null;
}

/**
 * Probe the chain. Never throws — the UI shows an honest "not connected" state instead of
 * a spinner that never resolves or, worse, invented data.
 */
export async function chainStatus(): Promise<ChainStatus> {
  const addresses = configuredAddresses();
  const missing = [
    ["PatientRegistry", env.PATIENT_REGISTRY_ADDRESS],
    ["ConsentManager", env.CONSENT_MANAGER_ADDRESS],
    ["MedicalRecordRegistry", env.MEDICAL_RECORD_REGISTRY_ADDRESS],
    ["TreatmentRegistry", env.TREATMENT_REGISTRY_ADDRESS],
    ["AuditLog", env.AUDIT_LOG_ADDRESS],
  ]
    .filter(([, value]) => !isAddress(value as string))
    .map(([name]) => name as string);

  const base: ChainStatus = {
    configured: addresses !== null,
    reachable: false,
    rpcUrl: env.BLOCKCHAIN_RPC_URL,
    chainId: null,
    blockNumber: null,
    operator: operatorAddress(),
    addresses,
    missing,
    error: null,
  };

  try {
    const client = getPublicClient();
    const [blockNumber, chainId] = await Promise.all([client.getBlockNumber(), client.getChainId()]);
    return { ...base, reachable: true, blockNumber: Number(blockNumber), chainId: Number(chainId) };
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    logger.warn("Blockchain node unreachable", { rpcUrl: env.BLOCKCHAIN_RPC_URL, message });
    return { ...base, error: message };
  }
}

export const abis = contractAbis as unknown as Record<string, unknown[]>;

export function abiFor(name: keyof ContractAddresses): unknown[] {
  const abi = abis[name];
  if (!abi) throw new Error(`No ABI generated for ${name}. Run: npm run compile -w @breastcare/contracts`);
  return abi;
}

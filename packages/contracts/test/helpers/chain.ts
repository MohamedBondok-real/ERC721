/**
 * Test harness for the BreastCare contracts.
 *
 * Runs against Hardhat's **in-process EVM** (no external node, no compiler download):
 * artifacts are produced by `scripts/compile.ts` using the npm-distributed solc, and the
 * EVM itself comes from the Hardhat runtime that is loaded in-process here.
 *
 * This is a real EVM executing the real deployed bytecode — assertions below are about
 * actual on-chain state, receipts, reverts and emitted events.
 */
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers, type Contract, type ContractTransactionReceipt } from "ethers";

const require = createRequire(import.meta.url);
const hre = require("hardhat");

export const evm = hre.network.provider as {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  send: (method: string, params?: unknown[]) => Promise<unknown>;
};

/**
 * Two provider options matter for honest assertions:
 *  - `cacheTimeout: -1` disables ethers' short-lived request cache. Without it, an
 *    identical `eth_estimateGas` payload issued by a later test can be answered with the
 *    *previous* call's revert data, which silently makes revert assertions meaningless.
 *  - `batchMaxCount: 1` keeps one request per round-trip so a response can never be
 *    matched to the wrong request.
 */
export const provider = new ethers.BrowserProvider(evm as never, undefined, {
  batchMaxCount: 1,
  cacheTimeout: -1,
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export interface Artifact {
  contractName: string;
  abi: unknown[];
  bytecode: string;
}

export function artifact(name: string): Artifact {
  const file = path.join(ROOT, "artifacts", `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing artifact for ${name}. Run: npx tsx scripts/compile.ts`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Artifact;
}

export async function signer(index: number): Promise<ethers.Signer> {
  return provider.getSigner(index);
}

export async function deploy(
  name: string,
  args: unknown[] = [],
  deployer?: ethers.Signer,
): Promise<Contract> {
  const a = artifact(name);
  const factory = new ethers.ContractFactory(a.abi as never, a.bytecode, deployer ?? (await signer(0)));
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

/** Reset the in-process chain so every test file starts from a clean genesis. */
export async function resetChain(): Promise<void> {
  await evm.request({ method: "hardhat_reset" });
}

export async function mineBlocks(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await evm.request({ method: "evm_mine" });
  }
}

export async function increaseTime(seconds: number): Promise<void> {
  await evm.request({ method: "evm_increaseTime", params: [seconds] });
  await evm.request({ method: "evm_mine" });
}

export async function latestBlockTimestamp(): Promise<number> {
  const block = await provider.getBlock("latest");
  return block?.timestamp ?? 0;
}

/** Revert the chain to a snapshot (useful inside a single test). */
export async function snapshot(): Promise<string> {
  return (await evm.request({ method: "evm_snapshot" })) as string;
}

export async function revertToSnapshot(id: string): Promise<void> {
  await evm.request({ method: "evm_revert", params: [id] });
}

export async function balanceOf(address: string): Promise<bigint> {
  return provider.getBalance(address);
}

/* ------------------------------------------------------------------ */
/* Custom-error aware revert assertions                                */
/* ------------------------------------------------------------------ */

/**
 * Selector table for every custom error declared by the compiled contracts.
 *
 * Hardhat's in-process provider reports reverts as raw `VM Exception` payloads, which
 * ethers cannot always attribute to a contract ABI. Matching on the 4-byte selector —
 * computed from the real artifacts — keeps assertions precise without depending on that
 * attribution.
 */
const errorSelectors = new Map<string, Set<string>>();

function buildSelectorTable(): void {
  if (errorSelectors.size > 0) return;
  const dir = path.join(ROOT, "artifacts");
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "build-info.json") continue;
    const abi = (JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as { abi: unknown[] }).abi;
    const iface = new ethers.Interface(abi as never);
    for (const fragment of iface.fragments) {
      if (fragment.type !== "error") continue;
      // Several contracts can declare the same error name with different parameters
      // (e.g. PatientNotRegistered(address) and PatientNotRegistered(bytes32)), so keep
      // every selector registered under that name.
      const selectors = errorSelectors.get(fragment.name) ?? new Set<string>();
      selectors.add(fragment.selector);
      errorSelectors.set(fragment.name, selectors);
    }
  }
}

function extractRevertData(error: unknown): string | undefined {
  const candidates: unknown[] = [
    (error as { data?: unknown })?.data,
    (error as { info?: { error?: { data?: unknown } } })?.info?.error?.data,
    (error as { revert?: { data?: unknown } })?.revert?.data,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("0x")) return candidate.toLowerCase();
  }
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/0x[0-9a-fA-F]{8,}/);
  return match ? match[0].toLowerCase() : undefined;
}

/**
 * Assert that a contract call reverts with the named custom error.
 * Accepts several acceptable names (e.g. a contract error and an OZ error).
 */
export async function expectRevert(promise: Promise<unknown> | (() => Promise<unknown>), ...errorNames: string[]): Promise<void> {
  buildSelectorTable();
  const resolved = typeof promise === "function" ? (promise as () => Promise<unknown>)() : promise;
  const wanted = errorNames.map((name) => {
    const selectors = errorSelectors.get(name);
    if (!selectors || selectors.size === 0) {
      throw new Error(`Unknown custom error "${name}" — not present in any compiled artifact`);
    }
    return { name, selectors };
  });

  let thrown: unknown;
  try {
    const result = await resolved;
    await (result as { wait?: () => Promise<unknown> }).wait?.();
  } catch (error) {
    thrown = error;
  }

  if (thrown === undefined) {
    throw new Error(`Expected revert (${errorNames.join(" | ")}) but the call succeeded`);
  }

  const data = extractRevertData(thrown);
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  for (const { name, selectors } of wanted) {
    if (message.includes(name)) return;
    for (const selector of selectors) {
      if (data && data.startsWith(selector)) return;
    }
  }

  throw new Error(
    `Expected revert ${errorNames.join(" | ")} (selectors ${[...wanted.flatMap((w) => [...w.selectors])].join(", ")}) but got: ${message}`,
  );
}

/** Decode the events of a receipt for a given contract ABI. */
export function parseEvents(contract: Contract, receipt: ContractTransactionReceipt) {
  return receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log as never);
      } catch {
        return null;
      }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
}

export { ethers };

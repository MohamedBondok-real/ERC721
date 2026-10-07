/**
 * Deploys the BreastCare contract suite and writes the resulting addresses to
 * `deployments/<network>.json` plus a generated TypeScript module the frontend imports.
 *
 *   npx tsx scripts/deploy.ts --network localhost
 *   npx tsx scripts/deploy.ts --network sepolia
 *
 * The script is idempotent: if `deployments/<network>.json` already records addresses for
 * the current chain id, it reports them instead of deploying duplicates.
 *
 * Nothing about any patient is passed to this script — deployment only wires contracts.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const NETWORKS: Record<string, { url: string; chainId: number; label: string }> = {
  hardhat: { url: "http://127.0.0.1:8545", chainId: 31337, label: "Hardhat in-process" },
  localhost: { url: process.env.BLOCKCHAIN_RPC_URL ?? "http://127.0.0.1:8545", chainId: 31337, label: "Local Hardhat node" },
  sepolia: { url: process.env.SEPOLIA_RPC_URL ?? "", chainId: 11155111, label: "Sepolia testnet" },
};

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? (process.argv[index + 1] as string) : fallback;
}

function artifact(name: string): { abi: unknown[]; bytecode: string } {
  const file = path.join(ROOT, "artifacts", `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing artifact ${name}. Run: npm run compile -w @breastcare/contracts`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function deployContract(
  signer: ethers.Signer,
  name: string,
  args: unknown[],
): Promise<{ address: string; gas: bigint }> {
  const a = artifact(name);
  const factory = new ethers.ContractFactory(a.abi as never, a.bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  // `waitForDeployment()` resolves to the contract, so the receipt comes from its own tx.
  const receipt = await contract.deploymentTransaction()?.wait();
  const address = await contract.getAddress();
  console.log(`  ✓ ${name.padEnd(24)} ${address}  (${receipt?.gasUsed ?? 0n} gas)`);
  return { address, gas: receipt?.gasUsed ?? 0n };
}

async function main(): Promise<void> {
  const networkName = arg("network", "localhost");
  const network = NETWORKS[networkName];
  if (!network) throw new Error(`Unknown network "${networkName}". Available: ${Object.keys(NETWORKS).join(", ")}`);
  if (!network.url) throw new Error(`No RPC URL configured for ${networkName}. Set SEPOLIA_RPC_URL or BLOCKCHAIN_RPC_URL.`);

  const operatorKey =
    process.env.BLOCKCHAIN_OPERATOR_KEY ??
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  // `cacheTimeout: -1` disables ethers' request cache. With automining the pending nonce
  // changes on every deploy, and a cached `eth_getTransactionCount` reuses nonce 0.
  const provider = new ethers.JsonRpcProvider(network.url, undefined, {
    staticNetwork: false,
    batchMaxCount: 1,
    cacheTimeout: -1,
  });
  const signer = new ethers.Wallet(operatorKey, provider);
  const owner = await signer.getAddress();
  const chainId = Number((await provider.getNetwork()).chainId);
  const balance = await provider.getBalance(owner);

  console.log(`\nBreastCare AI contract deployment`);
  console.log(`  network   : ${network.label} (${networkName}, chainId ${chainId})`);
  console.log(`  deployer  : ${owner}`);
  console.log(`  balance   : ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n && chainId !== 31337) {
    throw new Error("Deployer account has no funds. Fund it before deploying.");
  }

  // The backend relayer account that is allowed to append audit entries and record
  // records/consents on behalf of users who signed off-chain. Defaults to the deployer.
  const systemAddress = process.env.BLOCKCHAIN_SYSTEM_ADDRESS ?? owner;

  const deploymentsDir = path.join(ROOT, "deployments");
  const recordPath = path.join(deploymentsDir, `${networkName}.json`);
  const previous = readPreviousDeployment(recordPath, chainId);

  // Re-running must not leave duplicate contracts behind. If every recorded address still
  // holds code on this chain, report it and refresh the generated files instead.
  if (previous && !process.argv.includes("--force")) {
    const missing = await contractsWithoutCode(provider, previous.addresses);
    if (missing.length === 0) {
      console.log("\nAlready deployed on this chain (pass --force to redeploy):");
      for (const [name, address] of Object.entries(previous.addresses)) {
        console.log(`  ✓ ${name.padEnd(24)} ${address}`);
      }
      writeOutputs(networkName, chainId, previous.addresses, previous.gasUsed, owner, systemAddress);
      return;
    }
    console.log(`\nRecorded deployment is incomplete (${missing.join(", ")} missing) — deploying fresh.\n`);
  }


  console.log("Deploying:");
  const auditLog = await deployContract(signer, "AuditLog", [owner]);
  const patientRegistry = await deployContract(signer, "PatientRegistry", [owner, auditLog.address]);
  const consentManager = await deployContract(signer, "ConsentManager", [owner, patientRegistry.address, auditLog.address]);
  const medicalRecordRegistry = await deployContract(signer, "MedicalRecordRegistry", [
    owner,
    patientRegistry.address,
    consentManager.address,
    auditLog.address,
  ]);
  const treatmentRegistry = await deployContract(signer, "TreatmentRegistry", [
    owner,
    patientRegistry.address,
    consentManager.address,
    auditLog.address,
  ]);

  console.log("\nWiring authorizations:");
  const registryContracts = [
    ["PatientRegistry", patientRegistry],
    ["ConsentManager", consentManager],
    ["MedicalRecordRegistry", medicalRecordRegistry],
    ["TreatmentRegistry", treatmentRegistry],
  ] as const;

  const audit = new ethers.Contract(auditLog.address, artifact("AuditLog").abi as never, signer);
  for (const [name, deployed] of registryContracts) {
    await (await audit.setAuthorizedSystem(deployed.address, true)).wait();
    console.log(`  ✓ AuditLog authorizes ${name}`);
  }
  await (await audit.setAuthorizedSystem(systemAddress, true)).wait();
  console.log(`  ✓ AuditLog authorizes relayer ${systemAddress}`);

  for (const [name, deployed] of registryContracts) {
    const contract = new ethers.Contract(deployed.address, artifact(name).abi as never, signer);
    await (await contract.setAuthorizedSystem(systemAddress, true)).wait();
    console.log(`  ✓ ${name} authorizes relayer`);
  }

  const addresses = {
    AuditLog: auditLog.address,
    PatientRegistry: patientRegistry.address,
    ConsentManager: consentManager.address,
    MedicalRecordRegistry: medicalRecordRegistry.address,
    TreatmentRegistry: treatmentRegistry.address,
  };

  const gasUsed = {
    AuditLog: Number(auditLog.gas),
    PatientRegistry: Number(patientRegistry.gas),
    ConsentManager: Number(consentManager.gas),
    MedicalRecordRegistry: Number(medicalRecordRegistry.gas),
    TreatmentRegistry: Number(treatmentRegistry.gas),
  };

  writeOutputs(networkName, chainId, addresses, gasUsed, owner, systemAddress);
}

/* ------------------------------------------------------------------ */
/* Generated outputs                                                   */
/* ------------------------------------------------------------------ */

type ContractAddresses = Record<string, string>;

/** Environment variable name the backend (`apps/backend/src/config/env.ts`) expects. */
const ENV_VAR_FOR: Record<string, string> = {
  AuditLog: "AUDIT_LOG_ADDRESS",
  PatientRegistry: "PATIENT_REGISTRY_ADDRESS",
  ConsentManager: "CONSENT_MANAGER_ADDRESS",
  MedicalRecordRegistry: "MEDICAL_RECORD_REGISTRY_ADDRESS",
  TreatmentRegistry: "TREATMENT_REGISTRY_ADDRESS",
};

interface DeploymentRecord {
  network: string;
  chainId: number;
  deployedAt: string;
  deployer: string;
  systemAddress: string;
  addresses: ContractAddresses;
  gasUsed: Record<string, number>;
}

function readPreviousDeployment(recordPath: string, chainId: number): DeploymentRecord | null {
  if (!fs.existsSync(recordPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(recordPath, "utf8")) as DeploymentRecord;
    return parsed.chainId === chainId && parsed.addresses ? parsed : null;
  } catch {
    return null;
  }
}

async function contractsWithoutCode(provider: ethers.JsonRpcProvider, addresses: ContractAddresses): Promise<string[]> {
  const missing: string[] = [];
  for (const [name, address] of Object.entries(addresses)) {
    const code = await provider.getCode(address);
    if (!code || code === "0x") missing.push(name);
  }
  return missing;
}

function writeOutputs(
  networkName: string,
  chainId: number,
  addresses: ContractAddresses,
  gasUsed: Record<string, number>,
  deployer: string,
  systemAddress: string,
): void {
  const deploymentsDir = path.join(ROOT, "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const record: DeploymentRecord = {
    network: networkName,
    chainId,
    deployedAt: new Date().toISOString(),
    deployer,
    systemAddress,
    addresses,
    gasUsed,
  };
  fs.writeFileSync(path.join(deploymentsDir, `${networkName}.json`), JSON.stringify(record, null, 2));

  // Generated module consumed by the frontend (wagmi/viem contract addresses).
  const frontendDir = path.resolve(ROOT, "../../apps/frontend/src/lib/contracts");
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.writeFileSync(
    path.join(frontendDir, "deployment.ts"),
    `// AUTO-GENERATED by packages/contracts/scripts/deploy.ts — do not edit.
export const deployedNetwork = ${JSON.stringify(networkName)};
export const deployedChainId = ${chainId};
export const contractAddresses = ${JSON.stringify(addresses, null, 2)} as const;
`,
  );

  // Env snippet with the exact variable names the backend reads.
  const envLines = [
    `# Generated by scripts/deploy.ts for network "${networkName}" (chainId ${chainId})`,
    `BLOCKCHAIN_RPC_URL=${NETWORKS[networkName]?.url ?? "http://127.0.0.1:8545"}`,
    `BLOCKCHAIN_CHAIN_ID=${chainId}`,
    `BLOCKCHAIN_SYSTEM_ADDRESS=${systemAddress}`,
    ...Object.entries(addresses).map(([name, address]) => `${ENV_VAR_FOR[name] ?? `${name.toUpperCase()}_ADDRESS`}=${address}`),
  ];
  fs.writeFileSync(path.join(deploymentsDir, `${networkName}.env`), envLines.join("\n") + "\n");

  console.log(`\nWrote deployments/${networkName}.json`);
  console.log(`Wrote deployments/${networkName}.env`);
  console.log(`Wrote apps/frontend/src/lib/contracts/deployment.ts`);
  console.log(`\nAdd to your .env:`);
  for (const line of envLines.slice(1)) console.log(`  ${line}`);
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

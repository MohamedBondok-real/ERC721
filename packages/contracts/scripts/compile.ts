/**
 * Compiles the BreastCare contracts with the npm-packaged `solc` (solc-js).
 *
 * Why not `hardhat compile`? Hardhat downloads its compiler binaries from
 * binaries.soliditylang.org. Using the npm-distributed compiler keeps the build fully
 * reproducible from the npm registry alone (and inside air-gapped CI runners), while
 * still emitting Hardhat-compatible artifacts so `ethers.getContractFactory`, block
 * explorers and type generators can consume them unchanged.
 *
 * Usage:  npx tsx scripts/compile.ts
 * Output: artifacts/<Contract>.json  +  artifacts/build-info.json
 */
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const solc = require("solc") as {
  version: () => string;
  compile: (input: string, options?: { import: (p: string) => { contents: string } | { error: string } }) => string;
};

const ROOT = path.resolve(__dirname, "..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts");
const NODE_MODULES = path.resolve(ROOT, "../../node_modules");

const OPTIMIZER_RUNS = 200;

function collectSources(dir: string, base: string, out: Record<string, { content: string }> = {}): Record<string, { content: string }> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSources(full, base, out);
    } else if (entry.name.endsWith(".sol")) {
      out[path.relative(base, full).split(path.sep).join("/")] = { content: fs.readFileSync(full, "utf8") };
    }
  }
  return out;
}

function findImport(importPath: string): { contents: string } | { error: string } {
  // Local, contracts-relative import.
  const local = path.join(CONTRACTS_DIR, importPath);
  if (fs.existsSync(local)) return { contents: fs.readFileSync(local, "utf8") };

  // node_modules import (OpenZeppelin, etc.)
  const resolved = path.join(NODE_MODULES, importPath);
  if (fs.existsSync(resolved)) return { contents: fs.readFileSync(resolved, "utf8") };

  return { error: `File not found: ${importPath}` };
}

function main(): void {
  const sources = collectSources(CONTRACTS_DIR, CONTRACTS_DIR);
  const sourceNames = Object.keys(sources);
  console.log(`solc ${solc.version()}`);
  console.log(`Compiling ${sourceNames.length} source file(s)…`);

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: OPTIMIZER_RUNS },
      evmVersion: "cancun",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata", "storageLayout"],
          "": ["ast"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

  const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  const warnings = (output.errors ?? []).filter((e: { severity: string }) => e.severity !== "error");

  for (const warning of warnings) {
    console.warn(warning.formattedMessage);
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(error.formattedMessage);
    throw new Error(`Solidity compilation failed with ${errors.length} error(s).`);
  }

  fs.rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const index: Record<string, string> = {};

  for (const [sourceName, contracts] of Object.entries<Record<string, any>>(output.contracts ?? {})) {
    for (const [contractName, contract] of Object.entries<any>(contracts)) {
      const artifact = {
        _format: "hh-sol-artifact-1",
        contractName,
        sourceName,
        abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`,
        deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
        linkReferences: {},
        deployedLinkReferences: {},
        storageLayout: contract.storageLayout,
        compiler: solc.version(),
      };
      const file = path.join(ARTIFACTS_DIR, `${contractName}.json`);
      fs.writeFileSync(file, JSON.stringify(artifact, null, 2));
      index[contractName] = path.relative(ROOT, file);
      const kb = (contract.evm.deployedBytecode.object.length / 2 / 1024).toFixed(1);
      console.log(`  ✓ ${contractName}  (${kb} KB runtime)`);
    }
  }

  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, "build-info.json"),
    JSON.stringify({ compiler: solc.version(), sources: sourceNames, optimizerRuns: OPTIMIZER_RUNS, builtAt: new Date().toISOString(), index }, null, 2),
  );

  // ABI-only bundle for the frontend (imported by wagmi/viem).
  const abis: Record<string, unknown> = {};
  for (const [name, rel] of Object.entries(index)) {
    abis[name] = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")).abi;
  }
  const frontendDir = path.resolve(ROOT, "../../apps/frontend/src/lib/contracts");
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.writeFileSync(path.join(frontendDir, "abis.ts"), `// AUTO-GENERATED by packages/contracts/scripts/compile.ts — do not edit.\nexport const abis = ${JSON.stringify(abis, null, 2)} as const;\n`);
  const backendDir = path.resolve(ROOT, "../../apps/backend/src/blockchain");
  fs.mkdirSync(backendDir, { recursive: true });
  fs.writeFileSync(
    path.join(backendDir, "abis.generated.ts"),
    `// AUTO-GENERATED by packages/contracts/scripts/compile.ts — do not edit.\nexport const contractAbis = ${JSON.stringify(abis, null, 2)} as const;\n`,
  );

  console.log(`\nArtifacts written to ${path.relative(ROOT, ARTIFACTS_DIR)}/ and ABIs exported to apps/frontend and apps/backend.`);
}

main();

/**
 * Hardhat is used here for one purpose: providing a local EVM.
 *
 * Compilation is handled by `scripts/compile.ts` (npm-distributed solc) and tests run in
 * Vitest against Hardhat's in-process EVM, so the config deliberately stays minimal and
 * CommonJS — that keeps it loadable both by `hardhat node` and by the test harness.
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const operatorKey =
  process.env.BLOCKCHAIN_OPERATOR_KEY ||
  // Default Hardhat account #0 — local development only.
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/** @type {import('hardhat').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  networks: {
    hardhat: { chainId: 31337, allowUnlimitedContractSize: false },
    localhost: {
      url: process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: [operatorKey],
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      chainId: 11155111,
      accounts: process.env.BLOCKCHAIN_OPERATOR_KEY ? [process.env.BLOCKCHAIN_OPERATOR_KEY] : [],
    },
  },
  mocha: { timeout: 120000 },
};

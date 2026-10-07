import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // The API layer is exercised through supertest against a fresh in-memory store per file,
    // so files run sequentially to keep the seeded cohort isolated.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    env: {
      NODE_ENV: "test",
      DATABASE_DRIVER: "memory",
      SEED_DEMO_DATA: "false",
      // Deterministic offline-chain behaviour even when a local node happens to be running.
      BLOCKCHAIN_RPC_URL: "http://127.0.0.1:8599",
      BLOCKCHAIN_OPERATOR_KEY: "",
      PATIENT_REGISTRY_ADDRESS: "",
      CONSENT_MANAGER_ADDRESS: "",
      MEDICAL_RECORD_REGISTRY_ADDRESS: "",
      TREATMENT_REGISTRY_ADDRESS: "",
      AUDIT_LOG_ADDRESS: "",
    },
  },
});

import { createApp } from "./app";
import { env } from "./config/env";
import { getStore, closeStore } from "./db";
import { logger } from "./lib/logger";
import { seedDemoData } from "./seed/demoData";
import { chainStatus } from "./blockchain/client";

async function main(): Promise<void> {
  const store = getStore();

  if (env.SEED_DEMO_DATA && env.DATABASE_DRIVER === "memory") {
    const summary = await seedDemoData(store);
    logger.info("Seeded fictional demo data", { ...summary } as unknown as Record<string, unknown>);
  }

  const chain = await chainStatus();
  if (chain.reachable && chain.configured) {
    logger.info("Blockchain connected", { chainId: chain.chainId, blockNumber: chain.blockNumber, addresses: chain.addresses });
  } else {
    logger.warn("Blockchain not connected — on-chain features are disabled and reported honestly in the API", {
      configured: chain.configured,
      missing: chain.missing,
      error: chain.error,
    });
  }

  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info("BreastCare AI API listening", { url: `http://${env.HOST}:${env.PORT}`, database: env.DATABASE_DRIVER });
    logger.info("Medical safety: this platform is educational and does not provide diagnoses.");
  });

  const shutdown = async (signal: string) => {
    logger.info("Shutting down", { signal });
    server.close();
    await closeStore();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error("Failed to start", { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});

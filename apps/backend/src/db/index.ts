import { env } from "../config/env";
import { logger } from "../lib/logger";
import { createMemoryStore } from "./memoryStore";
import { createPostgresStore } from "./postgresStore";
import type { Store } from "./types";

let store: Store | null = null;

/**
 * Returns the configured persistence layer.
 *
 * `DATABASE_DRIVER=memory` (default) gives an in-process store seeded with clearly
 * labelled fictional data — ideal for local development and the demo. `postgres` uses the
 * real relational schema in `schema.sql`.
 */
export function getStore(): Store {
  if (store) return store;

  const next: Store =
    env.DATABASE_DRIVER === "postgres"
      ? (logger.info("Using PostgreSQL persistence", { url: maskUrl(env.DATABASE_URL) }), createPostgresStore(env.DATABASE_URL))
      : (logger.info("Using in-memory persistence (demo data is fictional)"), createMemoryStore());

  store = next;
  return next;
}

export function setStore(next: Store): void {
  store = next;
}

export async function closeStore(): Promise<void> {
  if (store) {
    await store.close();
    store = null;
  }
}

function maskUrl(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
}

export type { Store } from "./types";
export * from "./types";

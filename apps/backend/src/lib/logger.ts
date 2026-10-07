import { env } from "../config/env";

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Minimal structured logger.
 *
 * Deliberately tiny and dependency-free, but note what it never logs: request bodies,
 * symptoms, notes or any other clinical payload. Only identifiers and outcomes.
 */
function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[env.LOG_LEVEL]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ?? {}),
  });
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};

/**
 * Redacts anything that could be clinical content before it reaches a log line or an
 * error response. Use on any object that may have originated from a request body.
 */
const SENSITIVE_KEYS = new Set([
  "password",
  "confirmPassword",
  "passwordHash",
  "body",
  "summary",
  "notes",
  "clinicalNotes",
  "assessment",
  "recommendations",
  "signature",
  "token",
  "authorization",
]);

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.has(key) ? "[redacted]" : redact(item, depth + 1);
  }
  return out;
}

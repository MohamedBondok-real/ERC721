import * as dotenv from "dotenv";
import * as path from "path";
import { z } from "zod";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters").default("breastcare-dev-secret-change-me"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  DEMO_AUTH_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value !== "false"),

  DATABASE_DRIVER: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z.string().default("postgres://breastcare:breastcare@localhost:5432/breastcare"),
  PGSSLMODE: z.string().default("disable"),

  FIELD_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "FIELD_ENCRYPTION_KEY must be a 32-byte hex string")
    .default("0000000000000000000000000000000000000000000000000000000000000000"),

  BLOCKCHAIN_RPC_URL: z.string().default("http://127.0.0.1:8545"),
  BLOCKCHAIN_CHAIN_ID: z.coerce.number().int().default(31337),
  BLOCKCHAIN_OPERATOR_KEY: z.string().default(""),
  BLOCKCHAIN_SYSTEM_ADDRESS: z.string().default(""),

  PATIENT_REGISTRY_ADDRESS: z.string().default(""),
  CONSENT_MANAGER_ADDRESS: z.string().default(""),
  MEDICAL_RECORD_REGISTRY_ADDRESS: z.string().default(""),
  TREATMENT_REGISTRY_ADDRESS: z.string().default(""),
  AUDIT_LOG_ADDRESS: z.string().default(""),

  SEED_DEMO_DATA: z
    .string()
    .default("true")
    .transform((value) => value !== "false"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with actionable output rather than leaking a partial configuration into runtime.
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and review the values.`);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

if (isProduction) {
  const insecure: string[] = [];
  if (env.JWT_SECRET === "breastcare-dev-secret-change-me") insecure.push("JWT_SECRET");
  if (env.FIELD_ENCRYPTION_KEY.startsWith("0000")) insecure.push("FIELD_ENCRYPTION_KEY");
  if (env.DEMO_AUTH_ENABLED) insecure.push("DEMO_AUTH_ENABLED=true");
  if (insecure.length > 0) {
    throw new Error(`Refusing to start in production with insecure defaults: ${insecure.join(", ")}`);
  }
}

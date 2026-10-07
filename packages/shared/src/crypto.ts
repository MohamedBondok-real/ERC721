/**
 * Canonical JSON serialisation + hashing.
 *
 * Every hash anchored on-chain is derived from `canonicalJson(value)` so that the
 * frontend, the backend and any auditor recompute byte-identical digests regardless of
 * key order, whitespace or platform.
 *
 * IMPORTANT: only digests cross the chain boundary. The canonical payload itself never
 * leaves the secure off-chain store.
 */

/** Deterministic JSON with sorted object keys, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortDeep);
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const child = record[key];
    if (child === undefined) continue;
    out[key] = sortDeep(child);
  }
  return out;
}

function toBytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * SHA-256 hex digest. Uses Web Crypto in the browser and `node:crypto` on the server.
 * Both implementations produce identical output for the same canonical payload.
 */
export async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", toBytes(input));
    return toHex(new Uint8Array(digest));
  }
  // Server-side fallback (Node). Imported lazily so browser bundles never see it.
  const nodeCrypto = (await import("node:crypto")) as typeof import("node:crypto");
  return nodeCrypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** SHA-256 as an `0x`-prefixed 32-byte value ready for Solidity `bytes32`. */
export async function bytes32From(value: unknown): Promise<string> {
  const canonical = typeof value === "string" ? value : canonicalJson(value);
  return `0x${await sha256Hex(canonical)}`;
}

/** Domain-tagged digest so hashes from different subsystems can never be confused. */
export async function taggedHash(domain: string, payload: unknown): Promise<string> {
  return sha256Hex(`${domain}:${canonicalJson(payload)}`);
}

/**
 * Pseudonymous patient identifier. Deterministic for a given wallet address, matching
 * `PatientRegistry.derivePatientId` in Solidity (keccak256 is used on-chain; this helper
 * mirrors the *shape* of the id for off-chain correlation).
 */
export function shortId(prefix: string, seed: string, length = 10): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  let n = Math.abs(hash);
  for (let i = 0; i < length; i++) {
    out += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length) + i * 31;
  }
  return `${prefix}-${out}`;
}

/** True for `0x`-prefixed 64-hex-char values (Solidity `bytes32`). */
export function isBytes32(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/** True for `0x`-prefixed 40-hex-char values (EVM addresses). */
export function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

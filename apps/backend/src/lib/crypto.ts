import * as crypto from "node:crypto";
import { canonicalJson } from "@breastcare/shared";
import { encodePacked, keccak256 as viemKeccak256 } from "viem";
import { env } from "../config/env";

/* ------------------------------------------------------------------ */
/* Field-level encryption (AES-256-GCM)                                */
/*                                                                     */
/* Applied to free-text clinical fields before they are persisted, so  */
/* a database dump alone does not expose narrative clinical content.   */
/* ------------------------------------------------------------------ */

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1";

function key(): Buffer {
  return Buffer.from(env.FIELD_ENCRYPTION_KEY, "hex");
}

export function encryptText(plaintext: string): string {
  if (plaintext === "") return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptText(value: string): string {
  if (!value.startsWith(PREFIX)) return value; // plaintext from before encryption was enabled
  const [, iv, tag, ciphertext] = value.split(":");
  if (!iv || !tag || !ciphertext) throw new Error("Malformed encrypted value");
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/* ------------------------------------------------------------------ */
/* Hashing                                                             */
/* ------------------------------------------------------------------ */

/** SHA-256 hex of the canonical JSON of a value — the digest that goes on-chain. */
export function contentHash(value: unknown): string {
  const canonical = typeof value === "string" ? value : canonicalJson(value);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** `0x`-prefixed 32-byte digest for Solidity `bytes32` parameters. */
export function bytes32(value: unknown): string {
  return `0x${contentHash(value)}`;
}

/**
 * Consent scope digest. Mirrors `ConsentManager.scopeHashFor` in Solidity
 * (`keccak256(abi.encodePacked("BREASTCARE_CONSENT_V1", name, description))`) so the
 * backend and the chain derive the same scope identifier.
 */
export function scopeHash(name: string, description: string): string {
  return viemKeccak256(encodePacked(["string", "string", "string"], ["BREASTCARE_CONSENT_V1", name, description]));
}

/**
 * keccak256 — the hash function Solidity uses.
 *
 * NOTE: this is *not* NIST SHA3-256 (different padding), so Node's `createHash("sha3-256")`
 * must not be used here. viem's implementation is used so digests match the contracts
 * byte-for-byte.
 */
export function keccak256(input: string): string {
  return viemKeccak256(encodePacked(["string"], [input])).slice(2);
}

/** Short, human-quotable id such as `REC-7f3a9c2b`. */
export function shortHash(value: unknown, length = 8): string {
  return contentHash(value).slice(0, length);
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

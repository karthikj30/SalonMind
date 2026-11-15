import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level AES-256-GCM field encryption (RFP §4 "End-to-end data encryption (AES-256)").
 * Sensitive free text (client health/allergy notes, candidate resumes) is encrypted before it leaves
 * the app server, so it is ciphertext in Postgres, backups and logs — on top of Supabase's AES-256
 * at-rest disk encryption and TLS in transit.
 *
 * Format: "enc:v1:" + base64(iv[12] | authTag[16] | ciphertext). Key: DATA_ENCRYPTION_KEY = base64 of 32 bytes.
 */
const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const k = process.env.DATA_ENCRYPTION_KEY;
  if (!k) return null;
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be base64 of exactly 32 bytes (AES-256)");
  return buf;
}

export const isEncrypted = (v: string | null | undefined) => typeof v === "string" && v.startsWith(PREFIX);

export function encryptField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return plain ?? null;
  const k = key();
  if (!k || isEncrypted(plain)) return plain; // no key configured (local dev) → stored as-is
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decryptField(v: string | null | undefined): string | null {
  if (!isEncrypted(v)) return v ?? null;
  const k = key();
  if (!k) return "[encrypted]";
  const raw = Buffer.from(v!.slice(PREFIX.length), "base64");
  const d = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

/** Like decryptField, but never throws (wrong key or tampered value → placeholder) — for agents and pages. */
export function safeDecrypt(v: string | null | undefined): string | null {
  try { return decryptField(v); } catch { return "[encrypted — key mismatch]"; }
}

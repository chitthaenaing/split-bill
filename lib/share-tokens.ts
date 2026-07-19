import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** Opaque token length in bytes (hex-encoded → 2× chars). */
const TOKEN_BYTES = 24;

export function createShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Constant-time compare of a plaintext token against a stored SHA-256 hex hash.
 * Returns false when either side is missing/malformed.
 */
export function verifyShareToken(
  token: string | null | undefined,
  hash: string | null | undefined
): boolean {
  if (!token || !hash) return false;
  if (typeof token !== "string" || typeof hash !== "string") return false;
  if (!/^[0-9a-f]{64}$/i.test(hash)) return false;
  const actual = hashShareToken(token);
  try {
    return timingSafeEqual(
      Buffer.from(actual, "hex"),
      Buffer.from(hash.toLowerCase(), "hex")
    );
  } catch {
    return false;
  }
}

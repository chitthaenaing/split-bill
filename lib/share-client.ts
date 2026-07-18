/**
 * Browser-side helpers for share owner tokens and payment-proof delete tokens.
 * Kept out of server modules so client components can import safely.
 */

const OWNER_KEY_PREFIX = "bill-split:owner:";
const MY_PROOFS_KEY_PREFIX = "bill-split:my-proofs:";

export function ownerTokenKey(shareId: string): string {
  return `${OWNER_KEY_PREFIX}${shareId}`;
}

export function myProofsKey(shareId: string): string {
  return `${MY_PROOFS_KEY_PREFIX}${shareId}`;
}

export function saveOwnerToken(shareId: string, ownerToken: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ownerTokenKey(shareId), ownerToken);
  } catch {
    // quota or denied
  }
}

export function loadOwnerToken(shareId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ownerTokenKey(shareId));
  } catch {
    return null;
  }
}

export type MyProofEntry = { id: string; deleteToken?: string };

/**
 * Load proofs uploaded from this device. Supports legacy `string[]` of ids
 * (no delete token) and the newer `{ id, deleteToken }[]` shape.
 */
export function loadMyProofs(shareId: string): MyProofEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(myProofsKey(shareId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: MyProofEntry[] = [];
    for (const v of parsed) {
      if (typeof v === "string" && v) {
        out.push({ id: v });
      } else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.id === "string" && o.id) {
          out.push({
            id: o.id,
            ...(typeof o.deleteToken === "string" && o.deleteToken
              ? { deleteToken: o.deleteToken }
              : {}),
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function saveMyProofs(shareId: string, entries: MyProofEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(myProofsKey(shareId), JSON.stringify(entries));
  } catch {
    // quota or denied
  }
}

export function rememberMyProof(
  shareId: string,
  entry: MyProofEntry
): MyProofEntry[] {
  const prev = loadMyProofs(shareId);
  const next = [...prev.filter((p) => p.id !== entry.id), entry];
  saveMyProofs(shareId, next);
  return next;
}

export function forgetMyProof(
  shareId: string,
  receiptId: string
): MyProofEntry[] {
  const next = loadMyProofs(shareId).filter((p) => p.id !== receiptId);
  saveMyProofs(shareId, next);
  return next;
}

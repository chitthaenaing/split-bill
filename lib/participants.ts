import type { StoredPaymentReceipt } from "@/types/bill";

/** Shared limits for bill participant / covered-person names. */
export const MAX_PARTICIPANT_NAME_LEN = 40;
export const MAX_PARTICIPANTS = 20;

/**
 * Trim, strip ASCII control chars, cap length. Returns null if empty.
 * Same shape as payment payer-name sanitization so OCR names can match.
 */
export function sanitizeParticipantName(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s.length === 0) return null;
  const cleaned = s
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_PARTICIPANT_NAME_LEN);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Normalize a list of names: sanitize each, drop empties, de-dupe
 * case-insensitively (keeps first spelling), cap count.
 */
export function sanitizeParticipantList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const name = sanitizeParticipantName(item);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_PARTICIPANTS) break;
  }
  return out;
}

/**
 * Keep only names that appear on the bill roster (case-insensitive).
 * Preserves roster spelling. Empty when nothing matches.
 */
export function filterIncludedAgainstRoster(
  included: unknown,
  roster: readonly string[]
): string[] {
  const wanted = sanitizeParticipantList(included);
  if (wanted.length === 0 || roster.length === 0) return [];
  const byKey = new Map(
    roster.map((n) => [n.toLowerCase(), n] as const)
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of wanted) {
    const key = name.toLowerCase();
    const canonical = byKey.get(key);
    if (!canonical || seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
  }
  return out;
}

/**
 * Roster people covered by payment proofs: prefer each slip's
 * `includedNames`; fall back to matching OCR `payerName` to the roster.
 * Returns lowercase keys.
 */
export function coveredParticipantKeys(
  participants: readonly string[],
  receipts: readonly Pick<
    StoredPaymentReceipt,
    "includedNames" | "payerName"
  >[]
): Set<string> {
  const roster = sanitizeParticipantList(participants);
  const covered = new Set<string>();
  if (roster.length === 0) return covered;

  const rosterKeys = new Set(roster.map((n) => n.toLowerCase()));

  for (const receipt of receipts) {
    const included = sanitizeParticipantList(receipt.includedNames);
    if (included.length > 0) {
      for (const name of included) {
        const key = name.toLowerCase();
        if (rosterKeys.has(key)) covered.add(key);
      }
      continue;
    }
    const payer = sanitizeParticipantName(receipt.payerName);
    if (!payer) continue;
    const key = payer.toLowerCase();
    if (rosterKeys.has(key)) covered.add(key);
  }

  return covered;
}

/**
 * Participants who are not covered by any payment proof yet.
 * Empty when there is no roster (can't know who still owes).
 */
export function unpaidParticipants(
  participants: readonly string[],
  receipts: readonly Pick<
    StoredPaymentReceipt,
    "includedNames" | "payerName"
  >[]
): string[] {
  const roster = sanitizeParticipantList(participants);
  if (roster.length === 0) return [];
  const covered = coveredParticipantKeys(roster, receipts);
  return roster.filter((name) => !covered.has(name.toLowerCase()));
}

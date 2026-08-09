import {
  filterIncludedAgainstRoster,
  sanitizeParticipantList,
} from "./participants";
import type { StoredBill, StoredPaymentReceipt } from "@/types/bill";

export type StoredBillItem = StoredBill["items"][number];

/**
 * True when the owner assigned at least one line to someone — recipients
 * then identify themselves and only see their assigned items.
 */
export function billHasItemAssignments(
  items: readonly Pick<StoredBillItem, "assignedTo">[]
): boolean {
  return items.some(
    (it) => Array.isArray(it.assignedTo) && it.assignedTo.length > 0
  );
}

/**
 * Keep assignee names that appear on the roster (canonical spelling).
 * Empty when nothing valid remains.
 */
export function sanitizeAssignedTo(
  raw: unknown,
  roster: readonly string[]
): string[] {
  if (roster.length === 0) return [];
  return filterIncludedAgainstRoster(raw, roster);
}

/**
 * Normalize optional `assignedTo` on share-create items against the roster.
 * Drops the field when empty so legacy self-select shares stay unmarked.
 */
export function applyAssignmentsToItems<
  T extends {
    name: string;
    nameTranslated?: string;
    price: number;
    quantity: number;
    assignedTo?: unknown;
  },
>(
  items: readonly T[],
  roster: readonly string[]
): Array<{
  name: string;
  nameTranslated?: string;
  price: number;
  quantity: number;
  assignedTo?: string[];
}> {
  return items.map((it) => {
    const assignedTo = sanitizeAssignedTo(it.assignedTo, roster);
    return {
      name: it.name,
      ...(it.nameTranslated ? { nameTranslated: it.nameTranslated } : {}),
      price: it.price,
      quantity: it.quantity,
      ...(assignedTo.length > 0 ? { assignedTo } : {}),
    };
  });
}

/** Case-insensitive match: is `name` listed on this item's assignees? */
export function itemAssignedToName(
  item: Pick<StoredBillItem, "assignedTo">,
  name: string
): boolean {
  const key = name.trim().toLowerCase();
  if (!key || !Array.isArray(item.assignedTo)) return false;
  return item.assignedTo.some((n) => n.toLowerCase() === key);
}

/**
 * Items this participant owes, with selection pre-filled:
 * full line quantity, split equally among everyone assigned to that line.
 */
export function assignmentPickForParticipant(
  item: Pick<StoredBillItem, "quantity" | "assignedTo">,
  participantName: string
): { qty: number; split: number } | null {
  if (!itemAssignedToName(item, participantName)) return null;
  const assignees = item.assignedTo ?? [];
  const split = Math.max(1, assignees.length);
  const qty = Math.max(1, Math.floor(item.quantity || 1));
  return { qty, split };
}

/**
 * A participant is settled once any payment proof lists them in
 * `includedNames` (the existing "who does this transfer cover?" roster).
 */
export function participantIsSettled(
  name: string,
  receipts: readonly Pick<StoredPaymentReceipt, "includedNames">[]
): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  return receipts.some((r) =>
    (r.includedNames ?? []).some((n) => n.toLowerCase() === key)
  );
}

/** Lowercased names that appear on any proof's includedNames. */
export function settledParticipantKeys(
  receipts: readonly Pick<StoredPaymentReceipt, "includedNames">[]
): Set<string> {
  const out = new Set<string>();
  for (const r of receipts) {
    for (const n of r.includedNames ?? []) {
      const key = n.trim().toLowerCase();
      if (key) out.add(key);
    }
  }
  return out;
}

/**
 * Parse a raw `assignedTo` from JSON without a roster (share dialog draft).
 * Final filtering against participants happens at create time.
 */
export function parseAssignedToDraft(raw: unknown): string[] {
  return sanitizeParticipantList(raw);
}

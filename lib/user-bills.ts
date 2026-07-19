import "server-only";
import type {
  UserBillLink,
  UserBillRole,
  UserBillSummary,
} from "@/types/user-bills";
import { getAdminFirestore } from "./firebase-admin";
import { isValidShareId } from "./normalize-stored-bill";

export type { UserBillLink, UserBillRole, UserBillSummary };

async function linksCollection(uid: string) {
  const db = await getAdminFirestore();
  if (!db) return null;
  return db.collection("users").doc(uid).collection("links");
}

function sanitizeSummary(summary: UserBillSummary): UserBillSummary {
  const currency = String(summary.currency || "USD").slice(0, 8);
  const total = Number.isFinite(summary.total) ? Number(summary.total) : 0;
  const itemCount = Math.max(
    0,
    Math.min(500, Math.floor(Number(summary.itemCount) || 0))
  );
  const receiptUrl =
    typeof summary.receiptUrl === "string" &&
    /^https?:\/\//i.test(summary.receiptUrl)
      ? summary.receiptUrl.slice(0, 2048)
      : undefined;
  return {
    currency,
    total,
    itemCount,
    ...(receiptUrl ? { receiptUrl } : {}),
  };
}

function parseLink(
  shareId: string,
  data: Record<string, unknown>
): UserBillLink | null {
  const role = data.role === "shared" || data.role === "received" ? data.role : null;
  if (!role) return null;
  const createdAt = Number(data.createdAt);
  const updatedAt = Number(data.updatedAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;
  const summary = sanitizeSummary({
    currency: String(data.currency ?? "USD"),
    total: Number(data.total) || 0,
    itemCount: Number(data.itemCount) || 0,
    receiptUrl:
      typeof data.receiptUrl === "string" ? data.receiptUrl : undefined,
  });
  return {
    shareId,
    role,
    createdAt,
    updatedAt,
    ...summary,
  };
}

/**
 * Upsert a bill into the signed-in user's index.
 * - `shared` always wins over `received` if both apply (opening your own link).
 * - Missing Admin/Firestore credentials → no-op (accounts degrade gracefully).
 */
export async function recordUserBillLink(opts: {
  uid: string;
  shareId: string;
  role: UserBillRole;
  summary: UserBillSummary;
}): Promise<UserBillLink | null> {
  if (!isValidShareId(opts.shareId)) return null;
  const col = await linksCollection(opts.uid);
  if (!col) return null;

  const summary = sanitizeSummary(opts.summary);
  const ref = col.doc(opts.shareId);
  const now = Date.now();

  return col.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const created: UserBillLink = {
        shareId: opts.shareId,
        role: opts.role,
        createdAt: now,
        updatedAt: now,
        ...summary,
      };
      tx.set(ref, created);
      return created;
    }

    const existing = parseLink(
      opts.shareId,
      (snap.data() ?? {}) as Record<string, unknown>
    );
    if (!existing) {
      const created: UserBillLink = {
        shareId: opts.shareId,
        role: opts.role,
        createdAt: now,
        updatedAt: now,
        ...summary,
      };
      tx.set(ref, created);
      return created;
    }

    // Never downgrade shared → received.
    const role: UserBillRole =
      existing.role === "shared" || opts.role === "shared"
        ? "shared"
        : "received";

    const next: UserBillLink = {
      ...existing,
      role,
      updatedAt: now,
      currency: summary.currency || existing.currency,
      total: summary.total || existing.total,
      itemCount: summary.itemCount || existing.itemCount,
      ...(summary.receiptUrl
        ? { receiptUrl: summary.receiptUrl }
        : existing.receiptUrl
          ? { receiptUrl: existing.receiptUrl }
          : {}),
    };
    tx.set(ref, next);
    return next;
  });
}

export async function listUserBillLinks(
  uid: string
): Promise<{ shared: UserBillLink[]; received: UserBillLink[] }> {
  const col = await linksCollection(uid);
  if (!col) return { shared: [], received: [] };

  const snap = await col.orderBy("updatedAt", "desc").limit(100).get();
  const shared: UserBillLink[] = [];
  const received: UserBillLink[] = [];

  for (const doc of snap.docs) {
    const link = parseLink(doc.id, doc.data() as Record<string, unknown>);
    if (!link) continue;
    if (link.role === "shared") shared.push(link);
    else received.push(link);
  }

  return { shared, received };
}

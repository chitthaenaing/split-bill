"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { getFirebaseApp } from "./firebase-app";
import { isValidShareId } from "./normalize-stored-bill";
import type {
  UserBillLink,
  UserBillRole,
  UserBillSummary,
  UserBillsResponse,
} from "@/types/user-bills";

export { summaryFromBill, userBillIsSettled } from "./user-bill-summary";

function db() {
  return getFirestore(getFirebaseApp());
}

function linksCollection(uid: string) {
  return collection(db(), "users", uid, "links");
}

function sanitizePaidTotal(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.round(n * 100) / 100);
}

function sanitizeSummary(summary: UserBillSummary): UserBillSummary {
  const currency = String(summary.currency || "THB").slice(0, 8);
  const total = Number.isFinite(summary.total) ? Number(summary.total) : 0;
  const itemCount = Math.max(
    0,
    Math.min(500, Math.floor(Number(summary.itemCount) || 0))
  );
  const paidTotal = sanitizePaidTotal(summary.paidTotal);
  const receiptUrl =
    typeof summary.receiptUrl === "string" &&
    /^https?:\/\//i.test(summary.receiptUrl)
      ? summary.receiptUrl.slice(0, 2048)
      : undefined;
  return {
    currency,
    total,
    itemCount,
    ...(paidTotal !== undefined ? { paidTotal } : {}),
    ...(receiptUrl ? { receiptUrl } : {}),
  };
}

function parseLink(
  shareId: string,
  data: Record<string, unknown>
): UserBillLink | null {
  const role =
    data.role === "shared" || data.role === "received" ? data.role : null;
  if (!role) return null;
  const createdAt = Number(data.createdAt);
  const updatedAt = Number(data.updatedAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;
  return {
    shareId,
    role,
    createdAt,
    updatedAt,
    ...sanitizeSummary({
      currency: String(data.currency ?? "THB"),
      total: Number(data.total) || 0,
      itemCount: Number(data.itemCount) || 0,
      paidTotal: sanitizePaidTotal(data.paidTotal),
      receiptUrl:
        typeof data.receiptUrl === "string" ? data.receiptUrl : undefined,
    }),
  };
}

/**
 * Upsert a bill into the signed-in user's Firestore index (client SDK).
 * Uses the user's Auth session — no Admin credentials required.
 */
export async function recordUserBillLinkClient(opts: {
  uid: string;
  shareId: string;
  role: UserBillRole;
  summary: UserBillSummary;
}): Promise<UserBillLink | null> {
  if (!isValidShareId(opts.shareId)) return null;

  const summary = sanitizeSummary(opts.summary);
  const ref = doc(linksCollection(opts.uid), opts.shareId);
  const now = Date.now();
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const created: UserBillLink = {
      shareId: opts.shareId,
      role: opts.role,
      createdAt: now,
      updatedAt: now,
      ...summary,
    };
    await setDoc(ref, created);
    return created;
  }

  const existing = parseLink(opts.shareId, snap.data() as Record<string, unknown>);
  if (!existing) {
    const created: UserBillLink = {
      shareId: opts.shareId,
      role: opts.role,
      createdAt: now,
      updatedAt: now,
      ...summary,
    };
    await setDoc(ref, created);
    return created;
  }

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
    ...(summary.paidTotal !== undefined
      ? { paidTotal: summary.paidTotal }
      : existing.paidTotal !== undefined
        ? { paidTotal: existing.paidTotal }
        : {}),
    ...(summary.receiptUrl
      ? { receiptUrl: summary.receiptUrl }
      : existing.receiptUrl
        ? { receiptUrl: existing.receiptUrl }
        : {}),
  };
  await setDoc(ref, next);
  return next;
}

function byCreatedAtDesc(a: UserBillLink, b: UserBillLink): number {
  return b.createdAt - a.createdAt;
}

export async function listUserBillLinksClient(
  uid: string
): Promise<UserBillsResponse> {
  const q = query(
    linksCollection(uid),
    orderBy("createdAt", "desc"),
    limit(100)
  );
  const snap = await getDocs(q);
  const shared: UserBillLink[] = [];
  const received: UserBillLink[] = [];

  for (const docSnap of snap.docs) {
    const link = parseLink(docSnap.id, docSnap.data() as Record<string, unknown>);
    if (!link) continue;
    if (link.role === "shared") shared.push(link);
    else received.push(link);
  }

  shared.sort(byCreatedAtDesc);
  received.sort(byCreatedAtDesc);

  return { shared, received };
}

/** Map common Firestore client errors to a short user-facing message. */
export function userBillsErrorMessage(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (code === "permission-denied") {
    return "Firestore blocked this request. In Firebase Console → Firestore → Rules, publish the firestore.rules from this repo, then retry.";
  }
  if (code === "unavailable" || code === "failed-precondition") {
    return "Firestore isn't available yet. Create a Firestore database in the Firebase console for project split-bill-noti.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Could not load your bills.";
}

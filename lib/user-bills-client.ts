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

function db() {
  return getFirestore(getFirebaseApp());
}

function linksCollection(uid: string) {
  return collection(db(), "users", uid, "links");
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
      currency: String(data.currency ?? "USD"),
      total: Number(data.total) || 0,
      itemCount: Number(data.itemCount) || 0,
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
    ...(summary.receiptUrl
      ? { receiptUrl: summary.receiptUrl }
      : existing.receiptUrl
        ? { receiptUrl: existing.receiptUrl }
        : {}),
  };
  await setDoc(ref, next);
  return next;
}

export async function listUserBillLinksClient(
  uid: string
): Promise<UserBillsResponse> {
  const q = query(
    linksCollection(uid),
    orderBy("updatedAt", "desc"),
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

  return { shared, received };
}

/** Map common Firestore client errors to a short user-facing message. */
export function userBillsErrorMessage(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (code === "permission-denied") {
    return "Firestore blocked this request. Deploy firestore.rules from this repo (users can only read/write their own links).";
  }
  if (code === "unavailable" || code === "failed-precondition") {
    return "Firestore isn't available yet. Create a Firestore database in the Firebase console for project split-bill-noti.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Could not load your bills.";
}

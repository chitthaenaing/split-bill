"use client";

import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseApp } from "./firebase-app";
import { getIdToken } from "./firebase-auth-client";
import { dataUrlToBlob, prepareReceiptImage } from "./image-prep";
import { readJsonResponse } from "./read-json-response";
import type { UserPaymentQrProfile, UserProfile } from "@/types/user-profile";

function db() {
  return getFirestore(getFirebaseApp());
}

function profileRef(uid: string) {
  return doc(db(), "users", uid);
}

function isHttpsUrl(value: string): boolean {
  return /^https:\/\//i.test(value);
}

function sanitizePaymentQr(
  data: Record<string, unknown>
): UserPaymentQrProfile | null {
  const paymentQrUrl =
    typeof data.paymentQrUrl === "string" ? data.paymentQrUrl.trim() : "";
  const paymentQrContentType =
    typeof data.paymentQrContentType === "string"
      ? data.paymentQrContentType.trim().slice(0, 64)
      : "";
  const paymentQrUpdatedAt = Number(data.paymentQrUpdatedAt);
  if (
    !paymentQrUrl ||
    !isHttpsUrl(paymentQrUrl) ||
    paymentQrUrl.length > 2048 ||
    !paymentQrContentType.startsWith("image/") ||
    !Number.isFinite(paymentQrUpdatedAt)
  ) {
    return null;
  }
  return {
    paymentQrUrl: paymentQrUrl.slice(0, 2048),
    paymentQrContentType,
    paymentQrUpdatedAt,
  };
}

export async function getUserPaymentQrClient(
  uid: string
): Promise<UserPaymentQrProfile | null> {
  const snap = await getDoc(profileRef(uid));
  if (!snap.exists()) return null;
  return sanitizePaymentQr(snap.data() as Record<string, unknown>);
}

export async function setUserPaymentQrClient(opts: {
  uid: string;
  paymentQrUrl: string;
  paymentQrContentType: string;
}): Promise<UserPaymentQrProfile> {
  const paymentQrUpdatedAt = Date.now();
  const profile: UserPaymentQrProfile = {
    paymentQrUrl: opts.paymentQrUrl.slice(0, 2048),
    paymentQrContentType: opts.paymentQrContentType.slice(0, 64),
    paymentQrUpdatedAt,
  };
  if (!isHttpsUrl(profile.paymentQrUrl)) {
    throw new Error("Payment QR URL must be https.");
  }
  if (!profile.paymentQrContentType.startsWith("image/")) {
    throw new Error("Payment QR must be an image.");
  }

  // Merge-friendly: only touch payment QR fields on the user profile doc.
  await setDoc(
    profileRef(opts.uid),
    {
      paymentQrUrl: profile.paymentQrUrl,
      paymentQrContentType: profile.paymentQrContentType,
      paymentQrUpdatedAt: profile.paymentQrUpdatedAt,
    } satisfies UserProfile,
    { merge: true }
  );
  return profile;
}

export async function clearUserPaymentQrClient(uid: string): Promise<void> {
  const ref = profileRef(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  const otherKeys = Object.keys(data).filter(
    (k) =>
      k !== "paymentQrUrl" &&
      k !== "paymentQrContentType" &&
      k !== "paymentQrUpdatedAt"
  );
  if (otherKeys.length === 0) {
    await deleteDoc(ref);
    return;
  }
  await updateDoc(ref, {
    paymentQrUrl: deleteField(),
    paymentQrContentType: deleteField(),
    paymentQrUpdatedAt: deleteField(),
  });
}

type UploadResponse =
  | { url: string; contentType: string }
  | { error: string };

/**
 * Compress a QR image, upload it to Blob via `/api/me/payment-qr`, and
 * persist the public URL on the user's Firestore profile.
 */
export async function savePaymentQrToAccount(opts: {
  uid: string;
  dataUrl: string;
}): Promise<UserPaymentQrProfile> {
  const token = await getIdToken();
  if (!token) throw new Error("Sign in required to save a payment QR.");

  const prepared = await prepareReceiptImage(opts.dataUrl);
  const form = new FormData();
  form.append("file", dataUrlToBlob(prepared), "payment-qr.jpg");

  const res = await fetch("/api/me/payment-qr", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await readJsonResponse<UploadResponse>(res);
  if (!res.ok || "error" in data) {
    throw new Error(
      "error" in data ? data.error : `Upload failed (${res.status})`
    );
  }

  return setUserPaymentQrClient({
    uid: opts.uid,
    paymentQrUrl: data.url,
    paymentQrContentType: data.contentType,
  });
}

/** Delete Blob object + clear Firestore payment QR fields. */
export async function removePaymentQrFromAccount(uid: string): Promise<void> {
  const token = await getIdToken();
  if (!token) throw new Error("Sign in required to remove a payment QR.");

  const res = await fetch("/api/me/payment-qr", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await readJsonResponse<{ error?: string }>(res).catch(
      () => ({}) as { error?: string }
    );
    throw new Error(data.error || `Delete failed (${res.status})`);
  }

  await clearUserPaymentQrClient(uid);
}

/** Fetch a remote payment QR into a data URL for the local bill store. */
export async function paymentQrUrlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Could not load your saved payment QR.");
  }
  const blob = await res.blob();
  if (!blob.type.startsWith("image/") && blob.size === 0) {
    throw new Error("Saved payment QR is not a valid image.");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export function userProfileErrorMessage(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (code === "permission-denied") {
    return "Firestore blocked this request. Publish the latest firestore.rules from this repo, then retry.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Could not update your payment QR.";
}

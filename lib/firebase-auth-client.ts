"use client";

import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseApp } from "./firebase-app";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function getClientAuth() {
  return getAuth(getFirebaseApp());
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(getClientAuth(), callback);
}

/**
 * Sign in with Google. Prefers a popup; falls back to a full-page redirect
 * when the browser blocks popups (common on mobile Safari).
 */
export async function signInWithGoogle(): Promise<User | null> {
  const auth = getClientAuth();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    if (
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request"
    ) {
      // popup-closed-by-user is often intentional — only redirect on blocked.
      if (code === "auth/popup-blocked") {
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
      throw err;
    }
    // Some WebViews throw without a Firebase code when popups are blocked.
    if (code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

/** Finish a redirect-based Google sign-in if one is pending. */
export async function completeGoogleRedirect(): Promise<User | null> {
  try {
    const result = await getRedirectResult(getClientAuth());
    return result?.user ?? null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(getClientAuth());
}

/** Fresh ID token for Authorization: Bearer … headers. */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = getClientAuth().currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

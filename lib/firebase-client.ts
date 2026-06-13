"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  type Messaging,
} from "firebase/messaging";
import { firebaseConfig } from "./firebase-config";

let messagingPromise: Promise<Messaging | null> | null = null;

/** Lazily init Firebase Messaging, returning null where it isn't supported. */
function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((ok) => {
        if (!ok) return null;
        const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
        return getMessaging(app);
      })
      .catch(() => null);
  }
  return messagingPromise;
}

export type NotificationTokenResult =
  | { token: string }
  | { error: string; reason?: "unsupported" | "denied" | "config" };

/**
 * Ask the browser for notification permission and return an FCM registration
 * token for this device. Registers the messaging service worker so background
 * pushes are delivered when the tab is closed.
 */
export async function requestNotificationToken(): Promise<NotificationTokenResult> {
  try {
    const messaging = await getMessagingIfSupported();
    if (!messaging || typeof Notification === "undefined") {
      return {
        error: "This browser doesn't support push notifications.",
        reason: "unsupported",
      };
    }

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      return {
        error: "Notifications aren't configured yet (missing VAPID key).",
        reason: "config",
      };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        error: "Notifications are blocked for this site.",
        reason: "denied",
      };
    }

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return { error: "Couldn't obtain a notification token." };
    }
    return { token };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to enable notifications.",
    };
  }
}

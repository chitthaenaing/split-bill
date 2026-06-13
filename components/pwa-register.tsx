"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on load so the app is installable as a PWA
 * (and the FCM worker is active) regardless of whether notifications are
 * enabled. Registering the same URL again later is a no-op.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker
        .register("/firebase-messaging-sw.js")
        .catch(() => {
          // Registration can fail on unsupported browsers / private mode — ignore.
        });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

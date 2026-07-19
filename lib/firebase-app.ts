"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { firebaseConfig } from "./firebase-config";

/** Shared browser Firebase app (Auth, Messaging, etc.). */
export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

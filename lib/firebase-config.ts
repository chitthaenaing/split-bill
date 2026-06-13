/**
 * Firebase **web** config. These values are not secret — they ship to the
 * browser regardless — so they live in source rather than env vars. The
 * service worker (`public/firebase-messaging-sw.js`) keeps its own copy since
 * it can't import from the bundle.
 *
 * The VAPID key (used to mint web-push tokens) and the server service-account
 * credentials are the parts that DO live in env — see `.env.local.example`.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyBMaNQrxFAVB2nCP0MbYyKcPblWpQE3o7Y",
  authDomain: "split-bill-noti.firebaseapp.com",
  projectId: "split-bill-noti",
  storageBucket: "split-bill-noti.firebasestorage.app",
  messagingSenderId: "1078287589697",
  appId: "1:1078287589697:web:04130fcbe0d2cf6d0e81c0",
  measurementId: "G-082WVDM2CT",
};

import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { firebaseConfig } from "./firebase-config";

let cachedApp: App | null = null;

/**
 * Returns an initialised Firebase Admin app, or null when the service-account
 * credentials aren't configured (so push sending degrades to a no-op rather
 * than throwing). Credentials come from env — see `.env.local.example`.
 */
function getAdminApp(): App | null {
  if (cachedApp) return cachedApp;
  if (getApps().length) {
    cachedApp = getApps()[0]!;
    return cachedApp;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Private keys are stored with literal "\n"; restore real newlines.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;

  if (!clientEmail || !privateKey || !projectId) return null;

  cachedApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return cachedApp;
}

export type PushMessage = {
  title: string;
  body: string;
  /** Where the notification should take the recipient when clicked. */
  url?: string;
};

/**
 * Sends a data-only push to each token (the service worker renders it so we
 * don't get duplicate notifications on the web). Returns tokens FCM reported as
 * permanently invalid so the caller can prune them.
 */
export async function sendPushToTokens(
  tokens: string[],
  message: PushMessage
): Promise<{ invalidTokens: string[] }> {
  const app = getAdminApp();
  if (!app || tokens.length === 0) return { invalidTokens: [] };

  const res = await getMessaging(app).sendEachForMulticast({
    tokens,
    data: {
      title: message.title,
      body: message.body,
      url: message.url ?? "/",
    },
    webpush: {
      headers: { Urgency: "high" },
      fcmOptions: message.url ? { link: message.url } : undefined,
    },
  });

  const invalidTokens: string[] = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code ?? "";
    if (
      code.includes("registration-token-not-registered") ||
      code.includes("invalid-registration-token") ||
      code.includes("invalid-argument")
    ) {
      invalidTokens.push(tokens[i]!);
    }
  });

  return { invalidTokens };
}

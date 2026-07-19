import "server-only";
import { bearerTokenFromRequest } from "./auth-header";
import { firebaseConfig } from "./firebase-config";

export { bearerTokenFromRequest };

export type VerifiedIdToken = {
  uid: string;
  email?: string;
};

/**
 * Verify a Firebase ID token via Identity Toolkit REST (accounts:lookup).
 * Avoids `firebase-admin/auth`, which pulls jose and can crash on Vercel.
 */
export async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedIdToken | null> {
  const token = idToken.trim();
  if (!token || token.length > 4096) return null;

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
    firebaseConfig.apiKey
  )}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      users?: Array<{ localId?: string; email?: string }>;
    };
    const user = data.users?.[0];
    const uid = user?.localId?.trim();
    if (!user || !uid) return null;
    return {
      uid,
      ...(user.email ? { email: user.email } : {}),
    };
  } catch {
    return null;
  }
}

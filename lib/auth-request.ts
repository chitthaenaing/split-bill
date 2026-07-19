import "server-only";
import { verifyFirebaseIdToken } from "./verify-firebase-token";

export type AuthUser = {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

/**
 * Verify a Firebase ID token from `Authorization: Bearer <token>`.
 * Returns null when the header is missing or the token is invalid.
 */
export async function verifyBearerUser(
  req: Request
): Promise<AuthUser | null> {
  try {
    const header = req.headers.get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) return null;
    return await verifyFirebaseIdToken(match[1]!.trim());
  } catch (err) {
    console.error("[auth] ID token verification failed", err);
    return null;
  }
}

/** Same as verifyBearerUser but throws a 401-shaped error when missing/invalid. */
export async function requireBearerUser(req: Request): Promise<AuthUser> {
  const header = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(header.trim())) {
    const err = new Error("Sign in required.");
    (err as Error & { status: number }).status = 401;
    throw err;
  }

  const user = await verifyBearerUser(req);
  if (!user) {
    const err = new Error("Your session expired. Sign in again.");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return user;
}

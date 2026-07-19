import "server-only";
import { getAdminAuth } from "./firebase-admin";

export type AuthUser = {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

/**
 * Verify a Firebase ID token from `Authorization: Bearer <token>`.
 * Returns null when the header is missing, credentials aren't configured,
 * or the token is invalid — callers decide whether that's an error.
 */
export async function verifyBearerUser(
  req: Request
): Promise<AuthUser | null> {
  try {
    const header = req.headers.get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) return null;

    const auth = await getAdminAuth();
    if (!auth) return null;

    const decoded = await auth.verifyIdToken(match[1]!.trim());
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      picture: typeof decoded.picture === "string" ? decoded.picture : null,
    };
  } catch {
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
    const err = new Error(
      "Could not verify your account. Sign in again, or check that Firebase Admin credentials are configured."
    );
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return user;
}

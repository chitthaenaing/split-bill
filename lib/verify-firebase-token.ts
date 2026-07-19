import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { firebaseProjectId } from "./firebase-config";

export type VerifiedFirebaseUser = {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

/** Google's JWKS for Firebase Auth ID tokens (securetoken). */
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

/**
 * Verify a Firebase Auth ID token without `firebase-admin/auth`.
 *
 * Admin Auth pulls in jwks-rsa → jose@6 and crashes on Vercel's CJS runtime
 * (`ERR_REQUIRE_ESM`). Verifying with jose@4 + Google's public JWKS only needs
 * the project id (same as the web app).
 */
export async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedFirebaseUser> {
  const projectId = firebaseProjectId();
  const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });
  return userFromPayload(payload);
}

function userFromPayload(payload: JWTPayload): VerifiedFirebaseUser {
  const uid = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!uid) {
    throw new Error("Firebase ID token is missing subject.");
  }
  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : null,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

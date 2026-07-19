"use client";

import { getIdToken } from "./firebase-auth-client";

/**
 * fetch() that attaches `Authorization: Bearer <firebase id token>` when the
 * user is signed in. Anonymous callers still work — the header is omitted.
 *
 * For FormData bodies we strip any Content-Type so the runtime can set the
 * multipart boundary (passing a Headers object can otherwise break uploads).
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getIdToken();
  if (!token) return fetch(input, init);

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (typeof FormData !== "undefined" && init.body instanceof FormData) {
    headers.delete("Content-Type");
  }
  return fetch(input, { ...init, headers });
}

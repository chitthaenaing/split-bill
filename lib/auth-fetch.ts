"use client";

import { getIdToken } from "./firebase-auth-client";

/**
 * fetch() that attaches `Authorization: Bearer <firebase id token>` when the
 * user is signed in. Anonymous callers still work — the header is omitted.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await getIdToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

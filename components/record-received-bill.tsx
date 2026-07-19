"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { authFetch } from "@/lib/auth-fetch";

/**
 * When a signed-in user opens a shared bill, index it under "received".
 * Silent + once per mount; never blocks the page.
 */
export function RecordReceivedBill({ shareId }: { shareId: string }) {
  const { user, loading } = useAuth();
  const recordedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    const key = `${user.uid}:${shareId}`;
    if (recordedFor.current === key) return;
    recordedFor.current = key;

    void authFetch("/api/me/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId, role: "received" }),
    }).catch(() => {
      // best-effort
      recordedFor.current = null;
    });
  }, [user, loading, shareId]);

  return null;
}

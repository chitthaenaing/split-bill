"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { recordUserBillLinkClient } from "@/lib/user-bills-client";
import type { UserBillSummary } from "@/types/user-bills";

/**
 * When a signed-in user opens a shared bill, index it under "received".
 * Silent + once per mount; never blocks the page.
 */
export function RecordReceivedBill({
  shareId,
  summary,
}: {
  shareId: string;
  summary: UserBillSummary;
}) {
  const { user, loading } = useAuth();
  const recordedFor = useRef<string | null>(null);
  const summaryRef = useRef(summary);
  summaryRef.current = summary;

  useEffect(() => {
    if (loading || !user) return;
    const key = `${user.uid}:${shareId}`;
    if (recordedFor.current === key) return;
    recordedFor.current = key;

    void recordUserBillLinkClient({
      uid: user.uid,
      shareId,
      role: "received",
      summary: summaryRef.current,
    }).catch(() => {
      // best-effort — often means Firestore rules aren't deployed yet
      recordedFor.current = null;
    });
  }, [user, loading, shareId]);

  return null;
}

"use client";

import { useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestNotificationToken } from "@/lib/firebase-client";

type Status = "idle" | "working" | "enabled" | "error";

/**
 * Lets the bill sharer opt into a push notification that fires when someone
 * uploads a payment receipt. Registers this device's FCM token against the bill.
 */
export function NotifyToggle({ shareId }: { shareId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const enable = async () => {
    setStatus("working");
    setMessage(null);

    const result = await requestNotificationToken();
    if ("error" in result) {
      setStatus("error");
      setMessage(result.error);
      return;
    }

    try {
      const res = await fetch(`/api/share/${shareId}/notify-token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: result.token }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setStatus("enabled");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Couldn't enable alerts.");
    }
  };

  if (status === "enabled") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-accent/10 px-4 py-3 text-sm text-foreground">
        <BellRing className="h-4 w-4 shrink-0 text-accent" />
        <span>You'll be notified on this device when someone pays.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={enable}
        disabled={status === "working"}
      >
        {status === "working" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        Notify me when someone pays
      </Button>
      {status === "error" && message ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{message}</p>
      ) : null}
    </div>
  );
}

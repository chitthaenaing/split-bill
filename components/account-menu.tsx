"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";

export function AccountMenu() {
  const { user, loading, signIn, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Button variant="ghost" size="iconSm" aria-label="Account" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (!user) {
    return (
      <div className="relative" ref={rootRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={onSignIn}
          disabled={busy}
          className="rounded-xl"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserRound className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Sign in</span>
        </Button>
        {error && (
          <p className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-rose-700 shadow-sm dark:text-rose-300">
            {error}
          </p>
        )}
      </div>
    );
  }

  const photo = user.photoURL;
  const label = user.displayName || user.email || "Account";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40 transition-colors hover:bg-muted"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <UserRound className="h-4 w-4" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg shadow-black/10">
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium">{label}</p>
            {user.email && (
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/70"
          >
            <UserRound className="h-4 w-4 text-muted-foreground" />
            My bills
          </Link>
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await signOut();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/70"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

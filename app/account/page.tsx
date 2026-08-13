"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ExternalLink,
  Inbox,
  Loader2,
  Share2,
} from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { AppLogo } from "@/components/app-logo";
import { useAuth } from "@/components/auth-provider";
import { BankingQrPanel } from "@/components/banking-qr-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { readJsonResponse } from "@/lib/read-json-response";
import { userBillIsSettled } from "@/lib/user-bill-summary";
import {
  listUserBillLinksClient,
  recordUserBillLinkClient,
  userBillsErrorMessage,
} from "@/lib/user-bills-client";
import { cn, formatMoney } from "@/lib/utils";
import type { UserBillLink, UserBillsResponse } from "@/types/user-bills";

type ShareBalanceResponse = {
  shareId: string;
  currency: string;
  total: number;
  paidTotal: number;
  remaining: number;
  settled: boolean;
  itemCount: number;
  payers?: Array<{ name: string; amountPaid: number }>;
  receiptUrl?: string;
  error?: string;
};

function formatWhen(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

/**
 * Shared links: show who paid and how much (not remaining-left).
 * Received links: keep a compact Settled / Open status.
 */
function BillStatus({ link }: { link: UserBillLink }) {
  const settled = userBillIsSettled(link);
  const payers = Array.isArray(link.payers) ? link.payers : [];

  if (link.role === "shared") {
    if (payers.length === 0) {
      return (
        <span className="shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground">
          {settled ? "Settled" : "No payments yet"}
        </span>
      );
    }
    const visible = payers.slice(0, 3);
    const extra = payers.length - visible.length;
    return (
      <div className="max-w-[11rem] shrink-0 text-right">
        <ul className="space-y-0.5">
          {visible.map((p) => (
            <li
              key={p.name}
              className="truncate text-[11px] tabular-nums text-muted-foreground"
            >
              <span className="text-foreground/80">{p.name}</span>
              <span className="ml-1.5 font-medium text-foreground">
                {formatMoney(p.amountPaid, link.currency)}
              </span>
            </li>
          ))}
        </ul>
        {extra > 0 ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            +{extra} more
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "shrink-0 text-[11px] font-medium tracking-wide",
        settled
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-muted-foreground"
      )}
    >
      {settled ? "Settled" : "Open"}
    </span>
  );
}

function BillRow({ link }: { link: UserBillLink }) {
  return (
    <li>
      <Link
        href={`/b/${link.shareId}`}
        className="group flex items-center gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-muted/50 sm:px-2"
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          {link.receiptUrl ? (
            <img
              src={link.receiptUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted-foreground">
              <Share2 className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {formatMoney(link.total, link.currency)}
            <span className="ml-2 font-normal text-muted-foreground">
              · {link.itemCount} item{link.itemCount === 1 ? "" : "s"}
            </span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatWhen(link.createdAt)}
          </p>
        </div>
        <BillStatus link={link} />
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
}

function BillSection({
  title,
  empty,
  links,
}: {
  title: string;
  empty: string;
  links: UserBillLink[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">
        {title}
      </h2>
      {links.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {links.map((link) => (
            <BillRow key={link.shareId} link={link} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function fetchShareBalance(
  shareId: string
): Promise<ShareBalanceResponse | null> {
  try {
    const res = await fetch(`/api/share/${shareId}/balance`, {
      cache: "no-store",
    });
    const data = await readJsonResponse<ShareBalanceResponse>(res);
    if (!res.ok || data.error) return null;
    if (
      !Number.isFinite(data.total) ||
      !Number.isFinite(data.paidTotal) ||
      typeof data.currency !== "string"
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function mergeBalance(
  link: UserBillLink,
  balance: ShareBalanceResponse
): UserBillLink {
  const payers = Array.isArray(balance.payers)
    ? balance.payers
        .map((p) => ({
          name: String(p.name ?? "").trim(),
          amountPaid: Number(p.amountPaid),
        }))
        .filter(
          (p) =>
            p.name.length > 0 &&
            Number.isFinite(p.amountPaid) &&
            p.amountPaid > 0
        )
    : [];
  return {
    ...link,
    currency: balance.currency || link.currency,
    total: balance.total,
    paidTotal: balance.paidTotal,
    itemCount: balance.itemCount || link.itemCount,
    payers,
    ...(balance.receiptUrl
      ? { receiptUrl: balance.receiptUrl }
      : link.receiptUrl
        ? { receiptUrl: link.receiptUrl }
        : {}),
  };
}

export default function AccountPage() {
  const { user, loading: authLoading, signIn } = useAuth();
  const [bills, setBills] = useState<UserBillsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const refreshBalances = useCallback(
    async (uid: string, current: UserBillsResponse) => {
      const all = [...current.shared, ...current.received];
      if (all.length === 0) return;

      const results = await Promise.all(
        all.map(async (link) => {
          const balance = await fetchShareBalance(link.shareId);
          if (!balance) return null;
          const next = mergeBalance(link, balance);
          // Persist so the next visit is instant even if Blob is slow.
          void recordUserBillLinkClient({
            uid,
            shareId: link.shareId,
            role: link.role,
            summary: {
              currency: next.currency,
              total: next.total,
              itemCount: next.itemCount,
              paidTotal: next.paidTotal,
              payers: next.payers ?? [],
              ...(next.receiptUrl ? { receiptUrl: next.receiptUrl } : {}),
            },
          }).catch(() => {});
          return next;
        })
      );

      const byId = new Map<string, UserBillLink>();
      for (const link of results) {
        if (link) byId.set(link.shareId, link);
      }
      if (byId.size === 0) return;

      setBills((prev) => {
        if (!prev) return prev;
        return {
          shared: prev.shared.map((l) => byId.get(l.shareId) ?? l),
          received: prev.received.map((l) => byId.get(l.shareId) ?? l),
        };
      });
    },
    []
  );

  const load = useCallback(async () => {
    if (!user) {
      setBills(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const listed = await listUserBillLinksClient(user.uid);
      setBills(listed);
      void refreshBalances(user.uid, listed);
    } catch (e) {
      setError(userBillsErrorMessage(e));
      setBills(null);
    } finally {
      setLoading(false);
    }
  }, [user, refreshBalances]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/75 border-b border-border/50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <AppLogo />
            <span className="font-semibold tracking-tight text-base sm:text-lg">
              Bill Split
            </span>
          </Link>
          <div className="flex-1" />
          <AccountMenu />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-lg px-4 sm:px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-8"
        >
          <div className="space-y-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">My bills</h1>
            <p className="text-sm text-muted-foreground">
              Save a payment QR ahead of time, plus links you shared and opened
              while signed in.
            </p>
          </div>

          {authLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : !user ? (
            <div className="space-y-4 rounded-2xl border border-border px-5 py-8 text-center">
              <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Sign in with Google to save your payment QR and keep a history
                of shared and received bills across devices.
              </p>
              <Button
                variant="accent"
                size="sm"
                disabled={signingIn}
                onClick={async () => {
                  setSigningIn(true);
                  try {
                    await signIn();
                  } finally {
                    setSigningIn(false);
                  }
                }}
              >
                {signingIn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Sign in with Google
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              <BankingQrPanel variant="account" />

              {loading && !bills ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading your bills…
                </div>
              ) : error ? (
                <div className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-4 text-sm">
                  <p className="text-rose-700 dark:text-rose-300">{error}</p>
                  <Button variant="outline" size="sm" onClick={() => void load()}>
                    Retry
                  </Button>
                </div>
              ) : bills ? (
                <>
                  <BillSection
                    title="Shared by you"
                    empty="You haven’t shared a bill while signed in yet."
                    links={bills.shared}
                  />
                  <BillSection
                    title="Opened by you"
                    empty="Open a shared link while signed in and it’ll show up here."
                    links={bills.received}
                  />
                </>
              ) : null}
            </div>
          )}
        </motion.div>
      </main>

      <footer className="mt-auto border-t border-border/50 py-5 px-4 text-center text-xs text-muted-foreground">
        Built with Next.js, Tailwind &amp; OpenAI.
      </footer>
    </div>
  );
}

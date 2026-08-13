"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ExternalLink,
  Inbox,
  Loader2,
  Share2,
  Users,
  X,
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
  unpaid?: string[];
  hasRoster?: boolean;
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

function SharedBillStatusChip({ link }: { link: UserBillLink }) {
  const settled = userBillIsSettled(link);
  const payers = Array.isArray(link.payers) ? link.payers : [];
  const unpaid = Array.isArray(link.unpaid) ? link.unpaid : [];
  const label =
    unpaid.length > 0
      ? `${unpaid.length} unpaid`
      : payers.length > 0
        ? settled
          ? "All paid"
          : `${payers.length} paid`
        : settled
          ? "Settled"
          : "No payments yet";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium tracking-wide",
        unpaid.length > 0
          ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : payers.length > 0 || settled
            ? "bg-muted text-foreground"
            : "text-muted-foreground"
      )}
    >
      <Users className="h-3 w-3 opacity-70" />
      {label}
    </span>
  );
}

function PaidUsersModal({
  link,
  onClose,
}: {
  link: UserBillLink;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const payers = Array.isArray(link.payers) ? link.payers : [];
  const unpaid = Array.isArray(link.unpaid) ? link.unpaid : [];
  const paidTotal = Number(link.paidTotal) || 0;
  const settled = userBillIsSettled(link);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="paid-users-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-9999 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paid-users-title"
      >
        <motion.div
          initial={{ scale: 0.96, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/15"
        >
          <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 sm:pt-6 pb-3">
            <div className="min-w-0">
              <h2
                id="paid-users-title"
                className="text-lg font-semibold tracking-tight"
              >
                Payments
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatMoney(link.total, link.currency)} bill ·{" "}
                {formatWhen(link.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-5 sm:px-6 pb-5 sm:pb-6">
            <div className="rounded-xl border border-border bg-muted/20 px-3.5 py-3 space-y-2">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Bill total</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(link.total, link.currency)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(paidTotal, link.currency)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-border/70 pt-2 text-sm">
                <span className="font-medium">Status</span>
                <span
                  className={cn(
                    "font-semibold",
                    settled
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-foreground"
                  )}
                >
                  {settled ? "Settled" : "Open"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Who paid</p>
              {payers.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
                  No payment proofs yet.
                </p>
              ) : (
                <ul className="divide-y divide-border/70 rounded-xl border border-border">
                  {payers.map((p) => (
                    <li
                      key={p.name}
                      className="flex items-baseline justify-between gap-3 px-3.5 py-2.5 text-sm"
                    >
                      <span className="min-w-0 truncate text-foreground">
                        {p.name}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatMoney(p.amountPaid, link.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Still to pay
              </p>
              {unpaid.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3.5 py-5 text-center text-sm text-muted-foreground">
                  {link.hasRoster
                    ? "Everyone on the roster is covered."
                    : "Add people when sharing a bill to track who’s still unpaid."}
                </p>
              ) : (
                <ul className="divide-y divide-border/70 rounded-xl border border-border">
                  {unpaid.map((name) => (
                    <li
                      key={name}
                      className="flex items-baseline justify-between gap-3 px-3.5 py-2.5 text-sm"
                    >
                      <span className="min-w-0 truncate text-foreground">
                        {name}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-amber-800 dark:text-amber-300">
                        Unpaid
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Link
              href={`/b/${link.shareId}`}
              onClick={onClose}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90 active:scale-[0.98]"
            >
              <ExternalLink className="h-4 w-4" />
              Open bill
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function BillRow({
  link,
  onOpenPayments,
}: {
  link: UserBillLink;
  onOpenPayments?: (link: UserBillLink) => void;
}) {
  const settled = userBillIsSettled(link);
  const isShared = link.role === "shared";

  const content = (
    <>
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
      <div className="min-w-0 flex-1 text-left">
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
      {isShared ? (
        <SharedBillStatusChip link={link} />
      ) : (
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
      )}
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </>
  );

  return (
    <li>
      {isShared && onOpenPayments ? (
        <button
          type="button"
          onClick={() => onOpenPayments(link)}
          className="group flex w-full items-center gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-muted/50 sm:px-2"
        >
          {content}
        </button>
      ) : (
        <Link
          href={`/b/${link.shareId}`}
          className="group flex items-center gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-muted/50 sm:px-2"
        >
          {content}
        </Link>
      )}
    </li>
  );
}

function BillSection({
  title,
  empty,
  links,
  onOpenPayments,
}: {
  title: string;
  empty: string;
  links: UserBillLink[];
  onOpenPayments?: (link: UserBillLink) => void;
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
            <BillRow
              key={link.shareId}
              link={link}
              onOpenPayments={onOpenPayments}
            />
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
  const unpaid = Array.isArray(balance.unpaid)
    ? balance.unpaid.map((n) => String(n ?? "").trim()).filter(Boolean)
    : [];
  return {
    ...link,
    currency: balance.currency || link.currency,
    total: balance.total,
    paidTotal: balance.paidTotal,
    itemCount: balance.itemCount || link.itemCount,
    payers,
    unpaid,
    hasRoster: Boolean(balance.hasRoster),
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
  const [paymentsShareId, setPaymentsShareId] = useState<string | null>(null);
  const paymentsLink =
    paymentsShareId && bills
      ? [...bills.shared, ...bills.received].find(
          (l) => l.shareId === paymentsShareId
        ) ?? null
      : null;

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
              unpaid: next.unpaid ?? [],
              hasRoster: Boolean(next.hasRoster),
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
                    onOpenPayments={(link) => setPaymentsShareId(link.shareId)}
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

      {paymentsLink ? (
        <PaidUsersModal
          link={paymentsLink}
          onClose={() => setPaymentsShareId(null)}
        />
      ) : null}

      <footer className="mt-auto border-t border-border/50 py-5 px-4 text-center text-xs text-muted-foreground">
        Built with Next.js, Tailwind &amp; OpenAI.
      </footer>
    </div>
  );
}

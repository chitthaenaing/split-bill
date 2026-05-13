"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Wallet } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ItemsList } from "@/components/items-list";
import { TotalsPanel } from "@/components/totals-panel";
import { ReceiptThumbnail } from "@/components/receipt-thumbnail";
import { PaymentProofsSection } from "@/components/payment-proofs-section";
import type { BillItem, StoredBill } from "@/types/bill";

type Selection = Record<string, number>;

function storageKey(id: string) {
  return `bill-split:share:${id}`;
}

function loadSelection(id: string): Selection {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Selection = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = Math.floor(n);
    }
    return out;
  } catch {
    return {};
  }
}

function saveSelection(id: string, selection: Selection) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(selection));
  } catch {
    // quota or denied — ignore
  }
}

export function SharedBill({ data }: { data: StoredBill }) {
  const baseItems = useMemo<BillItem[]>(
    () =>
      data.items.map((it, i) => ({
        id: `i${i}`,
        name: it.name,
        price: it.price,
        quantity: Math.max(1, it.quantity || 1),
        selectedQuantity: 0,
      })),
    [data.items]
  );

  const [selection, setSelection] = useState<Selection>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSelection(loadSelection(data.id));
    setHydrated(true);
  }, [data.id]);

  useEffect(() => {
    if (hydrated) saveSelection(data.id, selection);
  }, [data.id, selection, hydrated]);

  const items = useMemo<BillItem[]>(
    () =>
      baseItems.map((it) => ({
        ...it,
        selectedQuantity: Math.min(
          it.quantity,
          Math.max(0, selection[it.id] ?? 0)
        ),
      })),
    [baseItems, selection]
  );

  const clamp = useCallback(
    (id: string, n: number) => {
      const base = baseItems.find((it) => it.id === id);
      if (!base) return 0;
      return Math.min(base.quantity, Math.max(0, Math.floor(n || 0)));
    },
    [baseItems]
  );

  const onToggle = useCallback(
    (id: string) =>
      setSelection((sel) => {
        const base = baseItems.find((it) => it.id === id);
        if (!base) return sel;
        const current = sel[id] ?? 0;
        return { ...sel, [id]: current > 0 ? 0 : base.quantity };
      }),
    [baseItems]
  );

  const onInc = useCallback(
    (id: string) =>
      setSelection((sel) => ({ ...sel, [id]: clamp(id, (sel[id] ?? 0) + 1) })),
    [clamp]
  );

  const onDec = useCallback(
    (id: string) =>
      setSelection((sel) => ({ ...sel, [id]: clamp(id, (sel[id] ?? 0) - 1) })),
    [clamp]
  );

  const onSelectAll = useCallback(
    () =>
      setSelection(() => {
        const next: Selection = {};
        for (const it of baseItems) next[it.id] = it.quantity;
        return next;
      }),
    [baseItems]
  );

  const onClearSelection = useCallback(() => setSelection({}), []);

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-9 w-9 rounded-2xl bg-accent text-accent-foreground flex items-center justify-center shadow-sm shadow-accent/30">
              <Wallet className="h-5 w-5" />
            </span>
            <span className="font-semibold tracking-tight text-base sm:text-lg">
              Bill Split
            </span>
          </Link>
          <div className="flex-1" />
          <div className="lg:hidden flex flex-wrap items-center justify-end gap-2">
            {data.bankingQrUrl ? (
              <ReceiptThumbnail
                src={data.bankingQrUrl}
                title="Payment QR"
              />
            ) : null}
            <ReceiptThumbnail src={data.receiptUrl} />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-5"
        >
          <div className="rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm flex items-start gap-3">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-snug">
                A bill was shared with you.
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick the items you had. Your selection only shows on your
                device.
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
              <ItemsList
                items={items}
                currency={data.currency}
                onToggle={onToggle}
                onInc={onInc}
                onDec={onDec}
                onSelectAll={onSelectAll}
                onClearSelection={onClearSelection}
              />
            </div>
            <aside className="space-y-4 lg:sticky lg:top-24 self-start">
              <TotalsPanel
                items={items}
                currency={data.currency}
                tax={data.tax}
                serviceCharge={data.serviceCharge}
                rounding={data.rounding}
                editable={false}
              />
              {data.bankingQrUrl ? (
                <ReceiptThumbnail
                  src={data.bankingQrUrl}
                  title="Payment QR"
                />
              ) : null}
              <div className="hidden lg:block">
                <ReceiptThumbnail src={data.receiptUrl} />
              </div>
              <PaymentProofsSection
                shareId={data.id}
                receipts={data.paymentReceipts ?? []}
              />
            </aside>
          </div>
        </motion.div>
      </main>

      <footer className="border-t border-border/60 py-5 px-4 text-center text-xs text-muted-foreground">
        Built with Next.js, Tailwind &amp; OpenAI.
      </footer>
    </div>
  );
}

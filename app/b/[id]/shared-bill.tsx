"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { AppLogo } from "@/components/app-logo";
import { IdentityPicker } from "@/components/identity-picker";
import { RecordReceivedBill } from "@/components/record-received-bill";
import { ThemeToggle } from "@/components/theme-toggle";
import { ItemsList } from "@/components/items-list";
import { TotalsPanel } from "@/components/totals-panel";
import { ReceiptThumbnail } from "@/components/receipt-thumbnail";
import { PaymentProofsSection } from "@/components/payment-proofs-section";
import {
  assignmentPickForParticipant,
  billHasItemAssignments,
  itemAssignedToName,
  participantIsSettled,
} from "@/lib/item-assignments";
import type { BillItem, StoredBill, StoredPaymentReceipt } from "@/types/bill";

/** Per-item picked state for one device: units taken and people splitting them. */
type Pick = { qty: number; split: number };
type Selection = Record<string, Pick>;

function storageKey(id: string) {
  return `bill-split:share:${id}`;
}

function translationsKey(id: string) {
  return `bill-split:share-translations:${id}`;
}

function identityKey(id: string) {
  return `bill-split:share-identity:${id}`;
}

function loadTranslations(id: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(translationsKey(id));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 200);
    }
    return out;
  } catch {
    return {};
  }
}

function saveTranslations(id: string, translations: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      translationsKey(id),
      JSON.stringify(translations)
    );
  } catch {
    // quota or denied — ignore
  }
}

function loadIdentity(id: string, roster: readonly string[]): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(identityKey(id));
    if (!raw) return null;
    const name = raw.trim();
    if (!name) return null;
    const match = roster.find((n) => n.toLowerCase() === name.toLowerCase());
    return match ?? null;
  } catch {
    return null;
  }
}

function saveIdentity(id: string, name: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!name) window.localStorage.removeItem(identityKey(id));
    else window.localStorage.setItem(identityKey(id), name);
  } catch {
    // quota or denied — ignore
  }
}

/** Read a pick from either the legacy `number` format or the `{qty, split}` one. */
function toPick(v: unknown): Pick | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
    return { qty: Math.floor(v), split: 1 };
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const qty = Number(o.qty);
    const split = Number(o.split);
    if (Number.isFinite(qty) && qty >= 0) {
      return {
        qty: Math.floor(qty),
        split: Number.isFinite(split) && split >= 1 ? Math.floor(split) : 1,
      };
    }
  }
  return null;
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
      const pick = toPick(v);
      if (pick) out[k] = pick;
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
  const participants = useMemo(
    () => data.participants ?? [],
    [data.participants]
  );
  const assignedMode = billHasItemAssignments(data.items);

  const [localTranslations, setLocalTranslations] = useState<
    Record<string, string>
  >({});
  const [selection, setSelection] = useState<Selection>({});
  const [viewerName, setViewerName] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<StoredPaymentReceipt[]>(
    () => data.paymentReceipts ?? []
  );
  const [hydrated, setHydrated] = useState(false);

  const defaultIncludedNames = useMemo(
    () => (assignedMode && viewerName ? [viewerName] : undefined),
    [assignedMode, viewerName]
  );

  const allBaseItems = useMemo<BillItem[]>(
    () =>
      data.items.map((it, i) => {
        const id = `i${i}`;
        const fromShare = it.nameTranslated?.trim();
        const fromLocal = localTranslations[id]?.trim();
        const nameTranslated = fromLocal || fromShare;
        return {
          id,
          name: it.name,
          ...(nameTranslated ? { nameTranslated } : {}),
          price: it.price,
          quantity: Math.max(1, it.quantity || 1),
          selectedQuantity: 0,
          splitCount: 1,
        };
      }),
    [data.items, localTranslations]
  );

  /** In assigned mode, only lines tagged for this viewer (empty until they pick). */
  const baseItems = useMemo<BillItem[]>(() => {
    if (!assignedMode) return allBaseItems;
    if (!viewerName) return [];
    return allBaseItems.filter((_, i) =>
      itemAssignedToName(data.items[i]!, viewerName)
    );
  }, [assignedMode, allBaseItems, viewerName, data.items]);

  useEffect(() => {
    setSelection(loadSelection(data.id));
    setLocalTranslations(loadTranslations(data.id));
    setViewerName(loadIdentity(data.id, participants));
    setReceipts(data.paymentReceipts ?? []);
    setHydrated(true);
    // Re-hydrate only when opening a different share id.
  }, [data.id]);

  // Once identity is known in assigned mode, force selection to the owner's
  // assignment (qty + equal split) so totals match what they owe.
  useEffect(() => {
    if (!hydrated || !assignedMode || !viewerName) return;
    const next: Selection = {};
    data.items.forEach((it, i) => {
      const pick = assignmentPickForParticipant(it, viewerName);
      if (pick) next[`i${i}`] = pick;
    });
    setSelection(next);
  }, [hydrated, assignedMode, viewerName, data.items]);

  useEffect(() => {
    if (hydrated && !assignedMode) saveSelection(data.id, selection);
  }, [data.id, selection, hydrated, assignedMode]);

  useEffect(() => {
    if (hydrated) saveTranslations(data.id, localTranslations);
  }, [data.id, localTranslations, hydrated]);

  useEffect(() => {
    if (hydrated && assignedMode) saveIdentity(data.id, viewerName);
  }, [data.id, viewerName, hydrated, assignedMode]);

  // The notification service worker asks the page to reload (fallback for tabs
  // it can't navigate directly) so a newly uploaded receipt shows up.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "bill-split:refresh") {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  const items = useMemo<BillItem[]>(
    () =>
      baseItems.map((it) => {
        const pick = selection[it.id];
        return {
          ...it,
          selectedQuantity: Math.min(
            it.quantity,
            Math.max(0, pick?.qty ?? 0)
          ),
          splitCount: Math.max(1, pick?.split ?? 1),
        };
      }),
    [baseItems, selection]
  );

  /**
   * Totals need the full bill as the denominator for tax/service ratio.
   * In assigned mode we still only *show* `items`, but compute against every
   * line with the viewer's picks applied.
   */
  const totalsItems = useMemo<BillItem[]>(() => {
    if (!assignedMode) return items;
    return allBaseItems.map((it) => {
      const pick = selection[it.id];
      return {
        ...it,
        selectedQuantity: Math.min(
          it.quantity,
          Math.max(0, pick?.qty ?? 0)
        ),
        splitCount: Math.max(1, pick?.split ?? 1),
      };
    });
  }, [assignedMode, items, allBaseItems, selection]);

  const viewerSettled =
    Boolean(viewerName) && participantIsSettled(viewerName!, receipts);
  const paidIds = useMemo(() => {
    if (!assignedMode || !viewerSettled) return new Set<string>();
    return new Set(items.map((it) => it.id));
  }, [assignedMode, viewerSettled, items]);

  const clampQty = useCallback(
    (id: string, n: number) => {
      const base = baseItems.find((it) => it.id === id);
      if (!base) return 0;
      return Math.min(base.quantity, Math.max(0, Math.floor(n || 0)));
    },
    [baseItems]
  );

  /** Update one item's pick, defaulting missing fields. */
  const updatePick = useCallback(
    (sel: Selection, id: string, patch: Partial<Pick>): Selection => {
      const current = sel[id] ?? { qty: 0, split: 1 };
      return { ...sel, [id]: { ...current, ...patch } };
    },
    []
  );

  const onToggle = useCallback(
    (id: string) => {
      if (assignedMode) return;
      setSelection((sel) => {
        const base = baseItems.find((it) => it.id === id);
        if (!base) return sel;
        const current = sel[id]?.qty ?? 0;
        return updatePick(sel, id, { qty: current > 0 ? 0 : base.quantity });
      });
    },
    [assignedMode, baseItems, updatePick]
  );

  const onInc = useCallback(
    (id: string) => {
      if (assignedMode) return;
      setSelection((sel) =>
        updatePick(sel, id, { qty: clampQty(id, (sel[id]?.qty ?? 0) + 1) })
      );
    },
    [assignedMode, clampQty, updatePick]
  );

  const onDec = useCallback(
    (id: string) => {
      if (assignedMode) return;
      setSelection((sel) =>
        updatePick(sel, id, { qty: clampQty(id, (sel[id]?.qty ?? 0) - 1) })
      );
    },
    [assignedMode, clampQty, updatePick]
  );

  const onIncSplit = useCallback(
    (id: string) => {
      if (assignedMode) return;
      setSelection((sel) =>
        updatePick(sel, id, {
          split: Math.max(1, (sel[id]?.split ?? 1) + 1),
        })
      );
    },
    [assignedMode, updatePick]
  );

  const onDecSplit = useCallback(
    (id: string) => {
      if (assignedMode) return;
      setSelection((sel) =>
        updatePick(sel, id, {
          split: Math.max(1, (sel[id]?.split ?? 1) - 1),
        })
      );
    },
    [assignedMode, updatePick]
  );

  const onSelectAll = useCallback(() => {
    if (assignedMode) return;
    setSelection((sel) => {
      const next: Selection = {};
      for (const it of baseItems) {
        next[it.id] = { qty: it.quantity, split: sel[it.id]?.split ?? 1 };
      }
      return next;
    });
  }, [assignedMode, baseItems]);

  const onClearSelection = useCallback(() => {
    if (assignedMode) return;
    setSelection({});
  }, [assignedMode]);

  const bannerTitle = assignedMode
    ? viewerName
      ? viewerSettled
        ? `Thanks, ${viewerName} — you're marked paid.`
        : `Hi ${viewerName} — here's what you owe.`
      : "A bill was shared with you."
    : "A bill was shared with you.";

  const bannerBody = assignedMode
    ? viewerName
      ? viewerSettled
        ? "Your assigned items are locked. You can still view the receipt and proofs below."
        : "Items were assigned by the person who paid. Pay your share, then upload a transfer screenshot."
      : "Choose your name to see only the items assigned to you."
    : "Pick the items you had. Your selection only shows on your device.";

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
          <div className="lg:hidden flex flex-wrap items-center justify-end gap-2">
            {data.bankingQrUrl ? (
              <ReceiptThumbnail
                src={data.bankingQrUrl}
                title="Payment QR"
                downloadable
                downloadBaseName="payment-qr"
                downloadMimeType={data.bankingQrContentType}
              />
            ) : null}
            <ReceiptThumbnail src={data.receiptUrl} />
          </div>
          <AccountMenu />
          <ThemeToggle />
        </div>
      </header>

      <RecordReceivedBill
        shareId={data.id}
        summary={{
          currency: data.currency,
          total:
            data.items.reduce((sum, it) => sum + (Number(it.price) || 0), 0) +
            (Number(data.tax) || 0) +
            (Number(data.serviceCharge) || 0) +
            (data.additionalCharges ?? []).reduce(
              (sum, c) => sum + Math.max(0, Number(c.amount) || 0),
              0
            ) +
            (Number(data.rounding) || 0) -
            (Number(data.discount) || 0),
          itemCount: data.items.length,
          ...(data.receiptUrl ? { receiptUrl: data.receiptUrl } : {}),
        }}
      />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-5"
        >
          <div className="rounded-xl border border-border/80 bg-card px-4 py-3.5 text-sm flex items-start gap-3">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-snug">{bannerTitle}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {bannerBody}
              </p>
            </div>
          </div>

          {assignedMode ? (
            <IdentityPicker
              participants={participants}
              value={viewerName}
              onChange={setViewerName}
            />
          ) : null}

          {assignedMode && !viewerName ? null : (
            <div className="grid lg:grid-cols-[1fr_340px] gap-5 lg:gap-6 items-start">
              <div className="space-y-5 min-w-0">
                {assignedMode && viewerName && items.length === 0 ? (
                  <div className="rounded-xl border border-border/80 bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                    Nothing was assigned to {viewerName} on this bill.
                  </div>
                ) : (
                  <ItemsList
                    items={items}
                    currency={data.currency}
                    onToggle={onToggle}
                    onInc={onInc}
                    onDec={onDec}
                    onIncSplit={onIncSplit}
                    onDecSplit={onDecSplit}
                    onSelectAll={onSelectAll}
                    onClearSelection={onClearSelection}
                    onApplyTranslations={
                      assignedMode
                        ? undefined
                        : (byId) =>
                            setLocalTranslations((prev) => ({
                              ...prev,
                              ...byId,
                            }))
                    }
                    selectionLocked={assignedMode}
                    paidIds={paidIds}
                    heading={
                      assignedMode
                        ? viewerSettled
                          ? "Your items (paid)"
                          : "Your items"
                        : undefined
                    }
                    description={
                      assignedMode
                        ? viewerSettled
                          ? "These lines are settled for you."
                          : `${items.length} assigned ${
                              items.length === 1 ? "item" : "items"
                            } · selection locked`
                        : undefined
                    }
                  />
                )}
              </div>
              <aside className="space-y-4 lg:sticky lg:top-24 self-start">
                <TotalsPanel
                  items={totalsItems}
                  currency={data.currency}
                  tax={data.tax}
                  serviceCharge={data.serviceCharge}
                  rounding={data.rounding}
                  discount={data.discount || 0}
                  additionalCharges={data.additionalCharges}
                  editable={false}
                />
                {data.bankingQrUrl ? (
                  <ReceiptThumbnail
                    src={data.bankingQrUrl}
                    title="Payment QR"
                    downloadable
                    downloadBaseName="payment-qr"
                    downloadMimeType={data.bankingQrContentType}
                  />
                ) : null}
                <div className="hidden lg:block">
                  <ReceiptThumbnail src={data.receiptUrl} />
                </div>
                <PaymentProofsSection
                  shareId={data.id}
                  currency={data.currency}
                  bill={{
                    items: data.items,
                    tax: data.tax,
                    serviceCharge: data.serviceCharge,
                    rounding: data.rounding,
                    discount: data.discount,
                    additionalCharges: data.additionalCharges,
                  }}
                  receipts={receipts}
                  participants={participants}
                  defaultIncludedNames={defaultIncludedNames}
                  onReceiptsChange={setReceipts}
                />
              </aside>
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

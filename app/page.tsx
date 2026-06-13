"use client";

import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { UploadCard } from "@/components/upload-card";
import { ItemsList } from "@/components/items-list";
import { TotalsPanel } from "@/components/totals-panel";
import { BankingQrPanel } from "@/components/banking-qr-panel";
import { ReceiptThumbnail } from "@/components/receipt-thumbnail";
import { ShareButton } from "@/components/share-button";
import { useBillStore } from "@/lib/store";
import { useHydrated } from "@/lib/use-hydrated";

export default function Home() {
  const hydrated = useHydrated();
  const items = useBillStore((s) => s.items);
  const currency = useBillStore((s) => s.currency);
  const tax = useBillStore((s) => s.tax);
  const serviceCharge = useBillStore((s) => s.serviceCharge);
  const rounding = useBillStore((s) => s.rounding);
  const receipt = useBillStore((s) => s.receiptDataUrl);

  const toggleItem = useBillStore((s) => s.toggleItem);
  const incSelected = useBillStore((s) => s.incSelected);
  const decSelected = useBillStore((s) => s.decSelected);
  const incSplit = useBillStore((s) => s.incSplit);
  const decSplit = useBillStore((s) => s.decSplit);
  const selectAll = useBillStore((s) => s.selectAll);
  const clearSelection = useBillStore((s) => s.clearSelection);
  const setTax = useBillStore((s) => s.setTax);
  const setServiceCharge = useBillStore((s) => s.setServiceCharge);
  const setRounding = useBillStore((s) => s.setRounding);
  const reset = useBillStore((s) => s.reset);

  const hasBill = items.length > 0;

  const onReset = () => {
    if (
      typeof window !== "undefined" &&
      window.confirm("Start over? Your current bill will be cleared.")
    ) {
      reset();
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={hasBill ? onReset : undefined}
            className="flex items-center gap-2"
            aria-label="Bill Split"
          >
            <AppLogo />
            <span className="font-semibold tracking-tight text-base sm:text-lg">
              Bill Split
            </span>
          </button>
          <div className="flex-1" />
          {hydrated && hasBill && (
            <>
              <div className="lg:hidden">
                <ReceiptThumbnail src={receipt} />
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <ShareButton />
                <Button variant="ghost" size="sm" onClick={onReset}>
                  <RotateCcw className="h-4 w-4" />
                  New bill
                </Button>
              </div>
            </>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        {!hydrated ? (
          <div className="py-24" />
        ) : !hasBill ? (
          <UploadCard />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="grid lg:grid-cols-[1fr_360px] gap-6 items-start"
          >
            <div className="space-y-6 min-w-0">
              <ItemsList
                items={items}
                currency={currency}
                onToggle={toggleItem}
                onInc={incSelected}
                onDec={decSelected}
                onIncSplit={incSplit}
                onDecSplit={decSplit}
                onSelectAll={selectAll}
                onClearSelection={clearSelection}
              />
            </div>
            <aside className="space-y-4 lg:sticky lg:top-24 self-start">
              <TotalsPanel
                items={items}
                currency={currency}
                tax={tax}
                serviceCharge={serviceCharge}
                rounding={rounding}
                editable
                onTaxChange={setTax}
                onServiceChange={setServiceCharge}
                onRoundingChange={setRounding}
              />
              <BankingQrPanel />
              <div className="hidden lg:block">
                <ReceiptThumbnail src={receipt} />
              </div>
              <div className="flex flex-col gap-2 sm:hidden">
                <ShareButton />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReset}
                  className="w-full"
                >
                  <RotateCcw className="h-4 w-4" />
                  New bill
                </Button>
              </div>
            </aside>
          </motion.div>
        )}
      </main>

      <footer className="border-t border-border/60 py-5 px-4 text-center text-xs text-muted-foreground">
        Built with Next.js, Tailwind &amp; OpenAI.
      </footer>
    </div>
  );
}

"use client";

import { AlertTriangle, X } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { itemsTotal } from "@/lib/calc";
import type { BillItem } from "@/types/bill";

export type ExtractionWarningProps = {
  warnings: string[];
  currency: string;
  items: BillItem[];
  printedSubtotal: number | null;
  printedTotal: number | null;
  onDismiss: () => void;
};

export function ExtractionWarning({
  warnings,
  currency,
  items,
  printedSubtotal,
  printedTotal,
  onDismiss,
}: ExtractionWarningProps) {
  if (!warnings.length) return null;

  const computedItems = itemsTotal(items);

  return (
    <div
      role="status"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="font-medium">
            Double-check this bill — the numbers didn&apos;t fully add up
          </p>
          <ul className="text-xs space-y-1 text-amber-900/80 dark:text-amber-100/80 list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-900/70 dark:text-amber-100/70 pt-1">
            Extracted items sum to {formatMoney(computedItems, currency)}
            {printedSubtotal != null && (
              <>
                {" "}
                · printed subtotal {formatMoney(printedSubtotal, currency)}
              </>
            )}
            {printedTotal != null && (
              <> · printed total {formatMoney(printedTotal, currency)}</>
            )}
            . Edit tax / service below, or retake the photo if a line looks wrong.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss warning"
          className="shrink-0 h-7 w-7 rounded-full hover:bg-amber-500/20 flex items-center justify-center transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

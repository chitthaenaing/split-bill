"use client";

import { AlertTriangle, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";
import { itemsTotal } from "@/lib/calc";
import { MAX_EXTRACTION_RESCANS } from "@/lib/extraction-rescan";
import type { BillItem } from "@/types/bill";

export type ExtractionWarningProps = {
  warnings: string[];
  currency: string;
  items: BillItem[];
  printedSubtotal: number | null;
  printedTotal: number | null;
  onDismiss: () => void;
  /** Remaining user-triggered rescans (0 = limit reached). */
  rescansRemaining: number;
  rescanning?: boolean;
  onRescan?: () => void;
  rescanError?: string | null;
};

function isVatSoftWarning(w: string): boolean {
  return /printed vat .+ differs from expected/i.test(w);
}

export function ExtractionWarning({
  warnings,
  currency,
  items,
  printedSubtotal,
  printedTotal,
  onDismiss,
  rescansRemaining: remaining,
  rescanning = false,
  onRescan,
  rescanError = null,
}: ExtractionWarningProps) {
  if (!warnings.length) return null;

  const computedItems = itemsTotal(items);
  const onlyVatSoft = warnings.every(isVatSoftWarning);
  const title = onlyVatSoft ? "VAT looks off" : "Totals don't match";
  const canRescan = Boolean(onRescan) && remaining > 0;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="font-medium">{title}</p>
          <ul className="text-xs space-y-1 text-amber-900/80 dark:text-amber-100/80 list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-900/70 dark:text-amber-100/70 pt-1">
            Extracted items {formatMoney(computedItems, currency)}
            {printedSubtotal != null && (
              <>
                {" "}
                vs receipt subtotal {formatMoney(printedSubtotal, currency)}
              </>
            )}
            {printedTotal != null && (
              <>
                {printedSubtotal != null ? "," : " vs"} receipt total{" "}
                {formatMoney(printedTotal, currency)}
              </>
            )}
            . Edit charges
            {canRescan ? ", rescan, or retake the photo." : ", or retake the photo."}
          </p>

          {onRescan && (
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canRescan || rescanning}
                onClick={onRescan}
                className="border-amber-600/30 bg-background/60 hover:bg-amber-500/15"
              >
                {rescanning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Rescanning…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Rescan
                    {remaining > 0
                      ? ` (${remaining} left)`
                      : ""}
                  </>
                )}
              </Button>
              <span className="text-[11px] text-amber-900/65 dark:text-amber-100/65">
                {remaining > 0
                  ? `Up to ${MAX_EXTRACTION_RESCANS} rescans per receipt.`
                  : "Rescan limit reached — edit items or retake the photo."}
              </span>
            </div>
          )}

          {rescanError && (
            <p className="text-xs text-rose-700 dark:text-rose-300 pt-1">
              {rescanError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss warning"
          className="shrink-0 h-7 w-7 rounded-lg hover:bg-amber-500/20 flex items-center justify-center transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

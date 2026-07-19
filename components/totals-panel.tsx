"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { computeSplit } from "@/lib/calc";
import {
  convertAmount,
  displayCurrencyOptions,
  normalizeCurrency,
} from "@/lib/frankfurter";
import {
  loadDisplayCurrency,
  saveDisplayCurrency,
} from "@/lib/display-currency";
import { useFxRate } from "@/lib/use-fx-rate";
import { cn, formatMoney, formatMoneyPlain } from "@/lib/utils";
import type { BillItem } from "@/types/bill";

export type TotalsPanelProps = {
  items: BillItem[];
  currency: string;
  tax: number;
  serviceCharge: number;
  rounding: number;
  /** When true, exposes an Edit toggle to adjust tax/service/rounding. */
  editable?: boolean;
  onTaxChange?: (n: number) => void;
  onServiceChange?: (n: number) => void;
  onRoundingChange?: (n: number) => void;
};

export function TotalsPanel({
  items,
  currency,
  tax,
  serviceCharge,
  rounding,
  editable = false,
  onTaxChange,
  onServiceChange,
  onRoundingChange,
}: TotalsPanelProps) {
  const split = useMemo(
    () => computeSplit(items, tax, serviceCharge, rounding),
    [items, tax, serviceCharge, rounding]
  );

  const billCurrency = normalizeCurrency(currency) || "USD";
  const currencyOptions = useMemo(
    () => displayCurrencyOptions(billCurrency),
    [billCurrency]
  );

  const [displayCurrency, setDisplayCurrency] = useState(billCurrency);
  const [prefReady, setPrefReady] = useState(false);

  useEffect(() => {
    const saved = loadDisplayCurrency();
    if (saved && currencyOptions.includes(saved)) {
      setDisplayCurrency(saved);
    } else {
      setDisplayCurrency(billCurrency);
    }
    setPrefReady(true);
  }, [billCurrency, currencyOptions]);

  const onDisplayCurrencyChange = (code: string) => {
    const next = normalizeCurrency(code) || billCurrency;
    setDisplayCurrency(next);
    saveDisplayCurrency(next);
  };

  const needsFx = prefReady && displayCurrency !== billCurrency;
  const { quote, loading: fxLoading, error: fxError } = useFxRate(
    billCurrency,
    needsFx ? displayCurrency : billCurrency
  );

  const convertedTotal =
    needsFx && quote ? convertAmount(split.total, quote.rate) : null;

  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const showEditingControls = editable && editing;
  const selectedCount = items.filter((it) => it.selectedQuantity > 0).length;

  const copyTotal = async () => {
    try {
      // Always copy the bill-currency amount (what you actually pay).
      await navigator.clipboard.writeText(formatMoneyPlain(split.total));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-border/70">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            You owe
          </p>
          <button
            type="button"
            onClick={copyTotal}
            disabled={split.total === 0}
            aria-label="Copy total"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </button>
        </div>
        <div className="mt-1.5">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={split.total}
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -6, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="block text-4xl sm:text-[2.75rem] font-bold tracking-tight tabular-nums leading-none"
            >
              {formatMoney(split.total, billCurrency)}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only">Show total in</span>
            <span aria-hidden="true">Show in</span>
            <select
              value={displayCurrency}
              onChange={(e) => onDisplayCurrencyChange(e.target.value)}
              className="h-7 rounded-md border border-border bg-card px-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              {currencyOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>

          {needsFx && (
            <AnimatePresence mode="wait">
              {fxLoading ? (
                <motion.span
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-muted-foreground"
                >
                  Converting…
                </motion.span>
              ) : convertedTotal != null && quote ? (
                <motion.span
                  key={`${displayCurrency}-${quote.rate}-${convertedTotal}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="text-sm font-medium tabular-nums text-foreground/90"
                >
                  ≈ {formatMoney(convertedTotal, displayCurrency)}
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                    mid-market
                    {quote.date ? ` · ${quote.date}` : ""}
                  </span>
                </motion.span>
              ) : fxError ? (
                <motion.span
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-muted-foreground"
                  title={fxError}
                >
                  Rate unavailable
                </motion.span>
              ) : null}
            </AnimatePresence>
          )}
        </div>

        <p className="mt-2.5 text-xs text-muted-foreground">
          {selectedCount === 0
            ? "Pick some items to get started."
            : `${selectedCount} ${selectedCount === 1 ? "item" : "items"} · ${Math.round(split.ratio * 100)}% of the bill`}
        </p>
      </div>

      <CardContent className="pt-4 pb-5 space-y-2.5 text-sm">
        <Row
          label="Items"
          value={formatMoney(split.selectedSubtotal, billCurrency)}
        />

        {showEditingControls ? (
          <EditableRow
            label="Tax"
            value={tax}
            onChange={onTaxChange ?? (() => {})}
            currency={billCurrency}
          />
        ) : (
          tax > 0 && (
            <Row
              label="Tax share"
              value={formatMoney(split.taxShare, billCurrency)}
              hint={`of ${formatMoney(tax, billCurrency)}`}
            />
          )
        )}

        {showEditingControls ? (
          <EditableRow
            label="Service"
            value={serviceCharge}
            onChange={onServiceChange ?? (() => {})}
            currency={billCurrency}
          />
        ) : (
          serviceCharge > 0 && (
            <Row
              label="Service share"
              value={formatMoney(split.serviceShare, billCurrency)}
              hint={`of ${formatMoney(serviceCharge, billCurrency)}`}
            />
          )
        )}

        {showEditingControls ? (
          <EditableRow
            label="Rounding"
            value={rounding}
            onChange={onRoundingChange ?? (() => {})}
            currency={billCurrency}
            allowNegative
          />
        ) : (
          rounding !== 0 && (
            <Row
              label="Rounding"
              value={formatMoney(split.roundingShare, billCurrency)}
              hint={`of ${formatMoney(rounding, billCurrency)}`}
            />
          )
        )}

        <div className="pt-2.5 mt-1 border-t border-border/70 flex items-center justify-between">
          <span className="font-semibold">Total</span>
          <span className="font-semibold tabular-nums">
            {formatMoney(split.total, billCurrency)}
          </span>
        </div>

        {editable && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors",
              editing
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? "Done" : "Edit tax / service / rounding"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">
        {label}
        {hint && (
          <span className="ml-1.5 text-[11px] text-muted-foreground/70">
            {hint}
          </span>
        )}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function EditableRow({
  label,
  value,
  onChange,
  currency,
  allowNegative = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  currency: string;
  allowNegative?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">
          {currency}
        </span>
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          min={allowNegative ? undefined : 0}
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          placeholder="0.00"
          className="h-9 w-28 text-right text-sm"
        />
      </div>
    </label>
  );
}

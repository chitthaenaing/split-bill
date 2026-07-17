"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { computeSplit } from "@/lib/calc";
import { cn, formatMoney, formatMoneyPlain } from "@/lib/utils";
import type { BillItem } from "@/types/bill";

export type TotalsPanelProps = {
  items: BillItem[];
  currency: string;
  tax: number;
  serviceCharge: number;
  rounding: number;
  discount?: number;
  /** When true, exposes an Edit toggle to adjust tax/service/discount/rounding. */
  editable?: boolean;
  onTaxChange?: (n: number) => void;
  onServiceChange?: (n: number) => void;
  onRoundingChange?: (n: number) => void;
  onDiscountChange?: (n: number) => void;
};

export function TotalsPanel({
  items,
  currency,
  tax,
  serviceCharge,
  rounding,
  discount = 0,
  editable = false,
  onTaxChange,
  onServiceChange,
  onRoundingChange,
  onDiscountChange,
}: TotalsPanelProps) {
  const split = useMemo(
    () => computeSplit(items, tax, serviceCharge, rounding, discount),
    [items, tax, serviceCharge, rounding, discount]
  );

  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const showEditingControls = editable && editing;
  const selectedCount = items.filter((it) => it.selectedQuantity > 0).length;

  const copyTotal = async () => {
    try {
      await navigator.clipboard.writeText(formatMoneyPlain(split.total));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-accent/10 via-accent/5 to-transparent px-6 pt-6 pb-5 border-b border-border">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          You owe
        </p>
        <div className="mt-1 flex items-baseline gap-2 flex-wrap">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={split.total}
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -6, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums"
            >
              {formatMoney(split.total, currency)}
            </motion.span>
          </AnimatePresence>
          <button
            type="button"
            onClick={copyTotal}
            disabled={split.total === 0}
            aria-label="Copy total"
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-full hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
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
        <p className="mt-2 text-xs text-muted-foreground">
          {selectedCount === 0
            ? "Pick some items to get started."
            : `${selectedCount} ${selectedCount === 1 ? "item" : "items"} • ${Math.round(split.ratio * 100)}% of the bill`}
        </p>
      </div>

      <CardContent className="pt-5 pb-5 space-y-2.5 text-sm">
        <Row
          label="Items"
          value={formatMoney(split.selectedSubtotal, currency)}
        />

        {showEditingControls ? (
          <EditableRow
            label="Discount"
            value={discount}
            onChange={onDiscountChange ?? (() => {})}
            currency={currency}
          />
        ) : (
          discount > 0 && (
            <Row
              label="Discount share"
              value={`−${formatMoney(split.discountShare, currency)}`}
              hint={`of ${formatMoney(discount, currency)}`}
            />
          )
        )}

        {showEditingControls ? (
          <EditableRow
            label="Tax"
            value={tax}
            onChange={onTaxChange ?? (() => {})}
            currency={currency}
          />
        ) : (
          tax > 0 && (
            <Row
              label="Tax share"
              value={formatMoney(split.taxShare, currency)}
              hint={`of ${formatMoney(tax, currency)}`}
            />
          )
        )}

        {showEditingControls ? (
          <EditableRow
            label="Service"
            value={serviceCharge}
            onChange={onServiceChange ?? (() => {})}
            currency={currency}
          />
        ) : (
          serviceCharge > 0 && (
            <Row
              label="Service share"
              value={formatMoney(split.serviceShare, currency)}
              hint={`of ${formatMoney(serviceCharge, currency)}`}
            />
          )
        )}

        {showEditingControls ? (
          <EditableRow
            label="Rounding"
            value={rounding}
            onChange={onRoundingChange ?? (() => {})}
            currency={currency}
            allowNegative
          />
        ) : (
          rounding !== 0 && (
            <Row
              label="Rounding"
              value={formatMoney(split.roundingShare, currency)}
              hint={`of ${formatMoney(rounding, currency)}`}
            />
          )
        )}

        <div className="pt-2.5 mt-1 border-t border-border flex items-center justify-between">
          <span className="font-semibold">Total</span>
          <span className="font-semibold tabular-nums">
            {formatMoney(split.total, currency)}
          </span>
        </div>

        {editable && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full transition-colors",
              editing
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? "Done" : "Edit tax / service / discount"}
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

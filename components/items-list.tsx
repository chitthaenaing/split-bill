"use client";

import { Check, Minus, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { unitPrice } from "@/lib/calc";
import { cn, formatMoney } from "@/lib/utils";
import type { BillItem } from "@/types/bill";

export type ItemsListProps = {
  items: BillItem[];
  currency: string;
  onToggle: (id: string) => void;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
};

export function ItemsList({
  items,
  currency,
  onToggle,
  onInc,
  onDec,
  onSelectAll,
  onClearSelection,
}: ItemsListProps) {
  const anySelectedRows = items.filter(
    (it) => it.selectedQuantity > 0
  ).length;
  const allRowsFull =
    items.length > 0 &&
    items.every((it) => it.selectedQuantity === it.quantity);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between flex-row gap-3">
        <div>
          <CardTitle className="text-base">
            Pick what you had
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {anySelectedRows} of {items.length}{" "}
            {items.length === 1 ? "item" : "items"} selected
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allRowsFull}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-full hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            All
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={anySelectedRows === 0}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-full hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            None
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No items detected on this receipt.
          </p>
        ) : (
          items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              currency={currency}
              onToggle={() => onToggle(it.id)}
              onInc={() => onInc(it.id)}
              onDec={() => onDec(it.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ItemRow({
  item,
  currency,
  onToggle,
  onInc,
  onDec,
}: {
  item: BillItem;
  currency: string;
  onToggle: () => void;
  onInc: () => void;
  onDec: () => void;
}) {
  const lineTotal = item.price || 0;
  const yourShare = unitPrice(item) * (item.selectedQuantity || 0);

  const fullySelected =
    item.selectedQuantity > 0 &&
    item.selectedQuantity === item.quantity;
  const partiallySelected =
    item.selectedQuantity > 0 && item.selectedQuantity < item.quantity;
  const someSelected = item.selectedQuantity > 0;
  const hasStepper = item.quantity > 1;

  return (
    <div
      className={cn(
        "rounded-2xl ring-1 ring-inset transition-colors",
        someSelected
          ? "bg-accent/10 ring-accent/30"
          : "bg-muted/40 ring-transparent hover:bg-muted"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={someSelected}
        aria-label={
          fullySelected
            ? `Deselect ${item.name}`
            : `Select ${item.name}`
        }
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:scale-[0.995] transition-transform"
      >
        <span
          className={cn(
            "h-6 w-6 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-semibold transition-all",
            fullySelected
              ? "bg-accent text-accent-foreground"
              : partiallySelected
              ? "bg-accent/30 text-accent ring-1 ring-inset ring-accent/40"
              : "bg-card border border-border"
          )}
          aria-hidden
        >
          {fullySelected ? (
            <Check className="h-4 w-4" strokeWidth={3} />
          ) : partiallySelected ? (
            item.selectedQuantity
          ) : null}
        </span>

        <span className="flex-1 min-w-0">
          <span
            className={cn(
              "block truncate text-sm font-medium",
              someSelected ? "text-foreground" : "text-foreground/85"
            )}
          >
            {item.name || "Untitled item"}
          </span>
          {hasStepper && (
            <span className="block text-xs text-muted-foreground">
              {item.quantity} × {formatMoney(unitPrice(item), currency)} each
            </span>
          )}
        </span>

        <span className="text-right shrink-0">
          {partiallySelected ? (
            <>
              <span className="block text-sm font-medium tabular-nums">
                {formatMoney(yourShare, currency)}
              </span>
              <span className="block text-[11px] text-muted-foreground tabular-nums">
                of {formatMoney(lineTotal, currency)}
              </span>
            </>
          ) : (
            <span
              className={cn(
                "block text-sm font-medium tabular-nums transition-colors",
                someSelected ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {formatMoney(lineTotal, currency)}
            </span>
          )}
        </span>
      </button>

      {hasStepper && (
        <div className="flex items-center justify-end gap-2 pl-12 pr-3 pb-2.5 -mt-1">
          <Stepper
            value={item.selectedQuantity}
            max={item.quantity}
            onInc={onInc}
            onDec={onDec}
          />
        </div>
      )}
    </div>
  );
}

function Stepper({
  value,
  max,
  onInc,
  onDec,
}: {
  value: number;
  max: number;
  onInc: () => void;
  onDec: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-card/80 border border-border p-0.5 shadow-sm shadow-black/[0.02]">
      <StepButton
        onClick={onDec}
        disabled={value <= 0}
        ariaLabel="Decrease"
      >
        <Minus className="h-3.5 w-3.5" />
      </StepButton>
      <span className="min-w-8 text-center text-xs font-semibold tabular-nums select-none px-0.5">
        {value} / {max}
      </span>
      <StepButton
        onClick={onInc}
        disabled={value >= max}
        ariaLabel="Increase"
      >
        <Plus className="h-3.5 w-3.5" />
      </StepButton>
    </div>
  );
}

function StepButton({
  onClick,
  disabled,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "h-7 w-7 rounded-full flex items-center justify-center transition-all active:scale-90",
        "bg-muted hover:bg-foreground hover:text-background",
        "disabled:bg-transparent disabled:text-muted-foreground/40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

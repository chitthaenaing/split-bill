"use client";

import { useState } from "react";
import {
  Check,
  Languages,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { itemShare, splitCountOf, unitPrice } from "@/lib/calc";
import { likelyNeedsTranslation } from "@/lib/bill-extract";
import { fetchItemTranslations } from "@/lib/translate-items-client";
import { cn, formatMoney } from "@/lib/utils";
import type { BillItem } from "@/types/bill";

export type ItemUpdatePatch = {
  name?: string;
  nameTranslated?: string | null;
  price?: number;
  quantity?: number;
};

export type ItemsListProps = {
  items: BillItem[];
  currency: string;
  onToggle: (id: string) => void;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onIncSplit: (id: string) => void;
  onDecSplit: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  /** When set, rows can be corrected (name / translation / line total / quantity). */
  onUpdateItem?: (id: string, patch: ItemUpdatePatch) => void;
  onRemoveItem?: (id: string) => void;
  /** When set, user can add a line the extractor missed. Returns the new id. */
  onAddItem?: () => string;
  /**
   * Apply English glosses for item ids. When set (or when `onUpdateItem` is),
   * a Translate control appears for non-Latin names missing a gloss.
   */
  onApplyTranslations?: (byId: Record<string, string>) => void;
};

export function ItemsList({
  items,
  currency,
  onToggle,
  onInc,
  onDec,
  onIncSplit,
  onDecSplit,
  onSelectAll,
  onClearSelection,
  onUpdateItem,
  onRemoveItem,
  onAddItem,
  onApplyTranslations,
}: ItemsListProps) {
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const anySelectedRows = items.filter(
    (it) => it.selectedQuantity > 0
  ).length;
  const allRowsFull =
    items.length > 0 &&
    items.every((it) => it.selectedQuantity === it.quantity);
  const canEdit = Boolean(onUpdateItem);
  const canTranslate = Boolean(onApplyTranslations || onUpdateItem);
  const translateTargets = items.filter(
    (it) =>
      !it.nameTranslated?.trim() &&
      it.name.trim() &&
      likelyNeedsTranslation(it.name)
  );

  const applyTranslations = (byId: Record<string, string>) => {
    if (onApplyTranslations) {
      onApplyTranslations(byId);
      return;
    }
    if (!onUpdateItem) return;
    for (const [id, nameTranslated] of Object.entries(byId)) {
      onUpdateItem(id, { nameTranslated });
    }
  };

  const onTranslate = async () => {
    if (!canTranslate || translateTargets.length === 0 || translating) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      const glosses = await fetchItemTranslations(
        translateTargets.map((it) => it.name)
      );
      const byId: Record<string, string> = {};
      translateTargets.forEach((it, i) => {
        const gloss = (glosses[i] ?? "").trim().slice(0, 200);
        if (gloss && gloss !== it.name) byId[it.id] = gloss;
      });
      if (Object.keys(byId).length === 0) {
        setTranslateError("No translations needed for these names.");
      } else {
        applyTranslations(byId);
      }
    } catch (e) {
      setTranslateError(
        e instanceof Error ? e.message : "Translation failed."
      );
    } finally {
      setTranslating(false);
    }
  };

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
            {canEdit ? " · tap the pencil to fix a line" : ""}
          </p>
          {translateError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
              {translateError}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {canTranslate && translateTargets.length > 0 && (
            <button
              type="button"
              onClick={onTranslate}
              disabled={translating}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
              aria-label="Translate item names to English"
            >
              {translating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Languages className="h-3.5 w-3.5" />
              )}
              Translate
            </button>
          )}
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allRowsFull}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            All
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={anySelectedRows === 0}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            None
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
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
              startEditing={it.id === autoEditId}
              onToggle={() => onToggle(it.id)}
              onInc={() => onInc(it.id)}
              onDec={() => onDec(it.id)}
              onIncSplit={() => onIncSplit(it.id)}
              onDecSplit={() => onDecSplit(it.id)}
              onUpdate={
                onUpdateItem
                  ? (patch) => onUpdateItem(it.id, patch)
                  : undefined
              }
              onRemove={onRemoveItem ? () => onRemoveItem(it.id) : undefined}
              onEditClose={() =>
                setAutoEditId((id) => (id === it.id ? null : id))
              }
            />
          ))
        )}
        {onAddItem && onUpdateItem && (
          <button
            type="button"
            onClick={() => setAutoEditId(onAddItem())}
            className="w-full mt-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-2.5 rounded-xl border border-dashed border-border hover:bg-muted/50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add missing item
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function ItemRow({
  item,
  currency,
  startEditing = false,
  onToggle,
  onInc,
  onDec,
  onIncSplit,
  onDecSplit,
  onUpdate,
  onRemove,
  onEditClose,
}: {
  item: BillItem;
  currency: string;
  startEditing?: boolean;
  onToggle: () => void;
  onInc: () => void;
  onDec: () => void;
  onIncSplit: () => void;
  onDecSplit: () => void;
  onUpdate?: (patch: ItemUpdatePatch) => void;
  onRemove?: () => void;
  onEditClose?: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [nameDraft, setNameDraft] = useState(item.name);
  const [translatedDraft, setTranslatedDraft] = useState(
    item.nameTranslated ?? ""
  );
  const [priceDraft, setPriceDraft] = useState(String(item.price ?? ""));
  const [qtyDraft, setQtyDraft] = useState(String(item.quantity ?? 1));

  const lineTotal = item.price || 0;
  const splitCount = splitCountOf(item);
  const yourShare = itemShare(item);
  /** What the user pays differs from the line total when taking a subset or sharing. */
  const showsShare = item.selectedQuantity > 0 && yourShare !== lineTotal;
  const displayName = item.nameTranslated?.trim() || item.name || "Untitled item";
  const showOriginal =
    Boolean(item.nameTranslated?.trim()) &&
    item.nameTranslated!.trim() !== item.name;

  const fullySelected =
    item.selectedQuantity > 0 &&
    item.selectedQuantity === item.quantity;
  const partiallySelected =
    item.selectedQuantity > 0 && item.selectedQuantity < item.quantity;
  const someSelected = item.selectedQuantity > 0;
  const hasStepper = item.quantity > 1;

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(item.name);
    setTranslatedDraft(item.nameTranslated ?? "");
    setPriceDraft(String(item.price ?? ""));
    setQtyDraft(String(item.quantity ?? 1));
    setEditing(true);
  };

  const closeEdit = () => {
    setEditing(false);
    onEditClose?.();
  };

  const saveEdit = () => {
    if (!onUpdate) return;
    const price = Number(priceDraft);
    const quantity = Math.max(1, Math.floor(Number(qtyDraft) || 1));
    const translated = translatedDraft.trim();
    onUpdate({
      name: nameDraft.trim() || item.name,
      nameTranslated: translated || null,
      price: Number.isFinite(price) ? price : item.price,
      quantity,
    });
    closeEdit();
  };

  if (editing && onUpdate) {
    return (
      <div className="rounded-xl border border-accent/35 bg-accent/[0.04] px-3 py-3 space-y-2.5">
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="Item name (as on receipt)"
          className="h-9 text-sm"
          aria-label="Item name"
        />
        <Input
          value={translatedDraft}
          onChange={(e) => setTranslatedDraft(e.target.value)}
          placeholder="English translation (optional)"
          className="h-9 text-sm"
          aria-label="English translation"
        />
        <div className="flex gap-2">
          <label className="flex-1 space-y-1">
            <span className="text-[11px] text-muted-foreground">Line total</span>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              className="h-9 text-sm tabular-nums"
              aria-label="Line total"
            />
          </label>
          <label className="w-24 space-y-1">
            <span className="text-[11px] text-muted-foreground">Qty</span>
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={qtyDraft}
              onChange={(e) => setQtyDraft(e.target.value)}
              className="h-9 text-sm tabular-nums"
              aria-label="Quantity"
            />
          </label>
        </div>
        <div className="flex items-center gap-2 justify-end">
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="mr-auto inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={closeEdit}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={saveEdit}
            className="inline-flex items-center gap-1 text-xs font-medium bg-accent text-accent-foreground px-2.5 py-1.5 rounded-lg"
          >
            <Check className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl transition-colors",
        someSelected
          ? "bg-accent/[0.08]"
          : "hover:bg-muted/60"
      )}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={someSelected}
          aria-label={
            fullySelected
              ? `Deselect ${displayName}`
              : `Select ${displayName}`
          }
          className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left active:scale-[0.995] transition-transform"
        >
          <span
            className={cn(
              "h-5 w-5 rounded-md flex items-center justify-center shrink-0 text-[11px] font-semibold transition-all",
              fullySelected
                ? "bg-accent text-accent-foreground"
                : partiallySelected
                ? "bg-accent/25 text-accent border border-accent/40"
                : "bg-card border border-border"
            )}
            aria-hidden
          >
            {fullySelected ? (
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
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
              {displayName}
            </span>
            {showOriginal && (
              <span className="block truncate text-xs text-muted-foreground">
                {item.name}
              </span>
            )}
            {hasStepper && (
              <span className="block text-xs text-muted-foreground">
                {item.quantity} × {formatMoney(unitPrice(item), currency)} each
              </span>
            )}
          </span>

          <span className="text-right shrink-0">
            {showsShare ? (
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

        {onUpdate && (
          <button
            type="button"
            onClick={openEdit}
            aria-label={`Edit ${displayName}`}
            className="shrink-0 px-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors rounded-r-xl"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {(hasStepper || someSelected) && (
        <div className="flex items-center justify-end gap-x-4 gap-y-2 flex-wrap pl-11 pr-3 pb-2.5 -mt-0.5">
          {someSelected && (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Users className="h-3 w-3" />
                Split
              </span>
              <Stepper
                value={splitCount}
                min={1}
                onInc={onIncSplit}
                onDec={onDecSplit}
                formatValue={(v) => `${v}`}
                suffix={
                  splitCount > 1
                    ? `${formatMoney(yourShare, currency)} each`
                    : undefined
                }
              />
            </div>
          )}
          {hasStepper && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Qty
              </span>
              <Stepper
                value={item.selectedQuantity}
                max={item.quantity}
                onInc={onInc}
                onDec={onDec}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stepper({
  value,
  min = 0,
  max,
  onInc,
  onDec,
  formatValue,
  suffix,
}: {
  value: number;
  min?: number;
  max?: number;
  onInc: () => void;
  onDec: () => void;
  formatValue?: (v: number) => string;
  suffix?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-card border border-border/80 p-0.5">
        <StepButton
          onClick={onDec}
          disabled={value <= min}
          ariaLabel="Decrease"
        >
          <Minus className="h-3.5 w-3.5" />
        </StepButton>
        <span className="min-w-8 text-center text-xs font-semibold tabular-nums select-none px-0.5">
          {formatValue ? formatValue(value) : `${value} / ${max}`}
        </span>
        <StepButton
          onClick={onInc}
          disabled={max !== undefined && value >= max}
          ariaLabel="Increase"
        >
          <Plus className="h-3.5 w-3.5" />
        </StepButton>
      </div>
      {suffix && (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {suffix}
        </span>
      )}
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
        "h-7 w-7 rounded-md flex items-center justify-center transition-all active:scale-90",
        "bg-muted hover:bg-foreground hover:text-background",
        "disabled:bg-transparent disabled:text-muted-foreground/40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

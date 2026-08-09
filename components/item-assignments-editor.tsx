"use client";

import { cn, formatMoney } from "@/lib/utils";
import { sanitizeParticipantList } from "@/lib/participants";

export type AssignableItem = {
  id: string;
  name: string;
  nameTranslated?: string;
  price: number;
  quantity: number;
};

type ItemAssignmentsEditorProps = {
  items: AssignableItem[];
  participants: string[];
  /** Map of item id → assignee names. */
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  currency: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Optional per-item assignee chips. Only shown when the share already has a
 * participant roster. Leaving every row empty keeps the classic self-select
 * share behaviour.
 */
export function ItemAssignmentsEditor({
  items,
  participants,
  value,
  onChange,
  currency,
  disabled,
  className,
}: ItemAssignmentsEditorProps) {
  if (participants.length === 0 || items.length === 0) return null;

  const assignedCount = items.filter(
    (it) => (value[it.id] ?? []).length > 0
  ).length;

  const toggle = (itemId: string, name: string) => {
    if (disabled) return;
    const current = value[itemId] ?? [];
    const key = name.toLowerCase();
    const nextNames = current.some((n) => n.toLowerCase() === key)
      ? current.filter((n) => n.toLowerCase() !== key)
      : sanitizeParticipantList([...current, name]);
    const next = { ...value };
    if (nextNames.length === 0) delete next[itemId];
    else next[itemId] = nextNames;
    onChange(next);
  };

  const clearAll = () => {
    if (disabled) return;
    onChange({});
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Assign who had each item?
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            Optional. When you assign items, each person only sees what they
            owe — and those lines lock after their payment is uploaded.
          </p>
        </div>
        {assignedCount > 0 ? (
          <button
            type="button"
            disabled={disabled}
            onClick={clearAll}
            className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </div>

      <ul className="max-h-56 space-y-2 overflow-y-auto pr-0.5">
        {items.map((it) => {
          const assignees = value[it.id] ?? [];
          const selectedKeys = new Set(assignees.map((n) => n.toLowerCase()));
          const displayName = it.nameTranslated?.trim() || it.name || "Item";
          return (
            <li
              key={it.id}
              className="rounded-xl border border-border/80 bg-muted/20 px-3 py-2.5 space-y-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayName}</p>
                  {it.nameTranslated?.trim() &&
                  it.nameTranslated.trim() !== it.name ? (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {it.name}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatMoney(it.price, currency)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {participants.map((name) => {
                  const on = selectedKeys.has(name.toLowerCase());
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={disabled}
                      aria-pressed={on}
                      onClick={() => toggle(it.id, name)}
                      className={cn(
                        "rounded-lg border px-2 py-1 text-xs font-medium transition-colors",
                        "disabled:opacity-50",
                        on
                          ? "border-accent/40 bg-accent/15 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      )}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              {assignees.length > 1 ? (
                <p className="text-[11px] text-muted-foreground">
                  Split equally between {assignees.join(", ")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {assignedCount > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {assignedCount} of {items.length}{" "}
          {items.length === 1 ? "item" : "items"} assigned
        </p>
      ) : null}
    </div>
  );
}

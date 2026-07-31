"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_PARTICIPANTS,
  sanitizeParticipantList,
  sanitizeParticipantName,
} from "@/lib/participants";
import { cn } from "@/lib/utils";

type ParticipantsEditorProps = {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Compact helper under the label. */
  hint?: string;
  className?: string;
};

/**
 * Named people on a shared bill — chip list + add field.
 * Used when creating a share link (roster is read-only on `/b/[id]`).
 */
export function ParticipantsEditor({
  value,
  onChange,
  disabled,
  hint = "Add everyone splitting this bill. People can mark who a transfer covers when they attach a pay slip.",
  className,
}: ParticipantsEditorProps) {
  const [draft, setDraft] = useState("");

  const addName = () => {
    const name = sanitizeParticipantName(draft);
    if (!name || disabled) return;
    const next = sanitizeParticipantList([...value, name]);
    onChange(next);
    setDraft("");
  };

  const removeName = (name: string) => {
    if (disabled) return;
    onChange(value.filter((n) => n.toLowerCase() !== name.toLowerCase()));
  };

  const atCap = value.length >= MAX_PARTICIPANTS;

  return (
    <div className={cn("space-y-2.5", className)}>
      <div>
        <p className="text-sm font-medium text-foreground">
          Who’s included on this bill?
        </p>
        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            {hint}
          </p>
        ) : null}
      </div>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((name) => (
            <li key={name}>
              <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/30 pl-2.5 pr-1 py-1 text-sm">
                <span className="max-w-[10rem] truncate">{name}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeName(name)}
                  aria-label={`Remove ${name}`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <Input
          value={draft}
          disabled={disabled || atCap}
          placeholder={atCap ? "Name limit reached" : "Add a name"}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addName();
            }
          }}
          className="h-10"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-10 shrink-0"
          disabled={disabled || atCap || !draft.trim()}
          onClick={addName}
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

type IncludedUsersPickerProps = {
  participants: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Multi-select of roster names — who a payment slip covers.
 */
export function IncludedUsersPicker({
  participants,
  selected,
  onChange,
  disabled,
  className,
}: IncludedUsersPickerProps) {
  if (participants.length === 0) return null;

  const selectedKeys = new Set(selected.map((n) => n.toLowerCase()));
  const allSelected = participants.every((n) =>
    selectedKeys.has(n.toLowerCase())
  );

  const toggle = (name: string) => {
    if (disabled) return;
    const key = name.toLowerCase();
    if (selectedKeys.has(key)) {
      onChange(selected.filter((n) => n.toLowerCase() !== key));
    } else {
      onChange(sanitizeParticipantList([...selected, name]));
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          Who does this transfer cover?
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(allSelected ? [] : [...participants])}
          className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {allSelected ? "None" : "All"}
        </button>
      </div>
      <ul className="space-y-1">
        {participants.map((name) => {
          const on = selectedKeys.has(name.toLowerCase());
          return (
            <li key={name}>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => toggle(name)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  "hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  "disabled:opacity-50",
                  on ? "bg-accent/10" : "bg-transparent"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px]",
                    on
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-transparent"
                  )}
                  aria-hidden
                >
                  ✓
                </span>
                <span className="truncate font-medium">{name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

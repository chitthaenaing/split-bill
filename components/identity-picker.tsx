"use client";

import { cn } from "@/lib/utils";

type IdentityPickerProps = {
  participants: string[];
  value: string | null;
  onChange: (name: string) => void;
  className?: string;
};

/**
 * "Who are you?" chooser for assigned-mode shared bills.
 */
export function IdentityPicker({
  participants,
  value,
  onChange,
  className,
}: IdentityPickerProps) {
  if (participants.length === 0) return null;
  const selectedKey = value?.toLowerCase() ?? "";

  return (
    <div className={cn("space-y-2.5", className)}>
      <div>
        <p className="text-sm font-medium text-foreground">Who are you?</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
          We’ll show only the items assigned to you.
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {participants.map((name) => {
          const on = selectedKey === name.toLowerCase();
          return (
            <li key={name}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange(name)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                  on
                    ? "border-accent/40 bg-accent/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                {name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

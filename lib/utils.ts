import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/**
 * The amount as a plain number string (no currency symbol or grouping), e.g.
 * "1234.50". Used when copying to the clipboard so the value can be pasted
 * straight into a banking app or calculator.
 */
export function formatMoneyPlain(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

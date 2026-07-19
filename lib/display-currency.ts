/** Per-device preferred display currency for FX conversion (not part of the bill). */

export const DISPLAY_CURRENCY_KEY = "bill-split:display-currency";

export function loadDisplayCurrency(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DISPLAY_CURRENCY_KEY);
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

export function saveDisplayCurrency(code: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!code) {
      window.localStorage.removeItem(DISPLAY_CURRENCY_KEY);
      return;
    }
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) return;
    window.localStorage.setItem(DISPLAY_CURRENCY_KEY, normalized);
  } catch {
    // quota or denied — ignore
  }
}

/**
 * Frankfurter FX helpers (https://www.frankfurter.app/).
 * Mid-market daily rates from central banks — fine for display, not transfers.
 */

export const FRANKFURTER_API = "https://api.frankfurter.dev/v2";

/** Currencies commonly seen on receipts in this app, plus a few home-currency picks. */
export const DISPLAY_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "THB",
  "SGD",
  "MYR",
  "AUD",
  "JPY",
  "IDR",
  "INR",
  "HKD",
  "CNY",
  "KRW",
  "PHP",
  "VND",
  "CAD",
  "NZD",
  "CHF",
] as const;

export type FxQuote = {
  from: string;
  to: string;
  rate: number;
  /** ISO date (YYYY-MM-DD) of the Frankfurter observation. */
  date: string;
};

type FrankfurterRateResponse = {
  date?: unknown;
  base?: unknown;
  quote?: unknown;
  rate?: unknown;
};

export function normalizeCurrency(code: string): string {
  return String(code || "")
    .trim()
    .toUpperCase()
    .slice(0, 8);
}

export function isValidCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(normalizeCurrency(code));
}

/** Currencies offered in the display picker, always including the bill currency. */
export function displayCurrencyOptions(billCurrency: string): string[] {
  const bill = normalizeCurrency(billCurrency);
  const set = new Set<string>(DISPLAY_CURRENCIES);
  if (isValidCurrencyCode(bill)) set.add(bill);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function convertAmount(amount: number, rate: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(rate)) return 0;
  return amount * rate;
}

export function parseFrankfurterRate(
  data: unknown,
  from: string,
  to: string
): FxQuote {
  const o = (data && typeof data === "object" ? data : {}) as FrankfurterRateResponse;
  const rate = Number(o.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No Frankfurter rate for ${from}/${to}.`);
  }
  const date =
    typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date)
      ? o.date
      : new Date().toISOString().slice(0, 10);
  return {
    from: normalizeCurrency(from),
    to: normalizeCurrency(to),
    rate,
    date,
  };
}

/**
 * Fetch a single pair rate from Frankfurter.
 * Same-currency pairs short-circuit to rate 1 (no network).
 */
export async function fetchFrankfurterRate(
  from: string,
  to: string,
  opts?: { fetch?: typeof fetch; signal?: AbortSignal }
): Promise<FxQuote> {
  const base = normalizeCurrency(from);
  const quote = normalizeCurrency(to);
  if (!isValidCurrencyCode(base) || !isValidCurrencyCode(quote)) {
    throw new Error("Currencies must be ISO 4217 codes (e.g. THB, USD).");
  }
  if (base === quote) {
    return {
      from: base,
      to: quote,
      rate: 1,
      date: new Date().toISOString().slice(0, 10),
    };
  }

  const fetchFn = opts?.fetch ?? fetch;
  const url = `${FRANKFURTER_API}/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`;
  const res = await fetchFn(url, {
    signal: opts?.signal,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = ` ${body.message}`;
    } catch {
      // ignore
    }
    throw new Error(
      `Frankfurter ${res.status} for ${base}/${quote}.${detail}`.trim()
    );
  }

  return parseFrankfurterRate(await res.json(), base, quote);
}

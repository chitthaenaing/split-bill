"use client";

import { useEffect, useState } from "react";
import {
  normalizeCurrency,
  type FxQuote,
} from "@/lib/frankfurter";
import { readJsonResponse } from "@/lib/read-json-response";

type State = {
  quote: FxQuote | null;
  loading: boolean;
  error: string | null;
};

const idle: State = { quote: null, loading: false, error: null };

/**
 * Load a mid-market Frankfurter rate via `/api/fx`.
 * Same-currency pairs resolve immediately to rate 1.
 */
export function useFxRate(from: string, to: string): State {
  const base = normalizeCurrency(from);
  const quote = normalizeCurrency(to);
  const [state, setState] = useState<State>(() =>
    base && quote && base === quote
      ? {
          quote: {
            from: base,
            to: quote,
            rate: 1,
            date: new Date().toISOString().slice(0, 10),
          },
          loading: false,
          error: null,
        }
      : idle
  );

  useEffect(() => {
    if (!base || !quote) {
      setState(idle);
      return;
    }
    if (base === quote) {
      setState({
        quote: {
          from: base,
          to: quote,
          rate: 1,
          date: new Date().toISOString().slice(0, 10),
        },
        loading: false,
        error: null,
      });
      return;
    }

    const ac = new AbortController();
    setState({ quote: null, loading: true, error: null });

    (async () => {
      try {
        const res = await fetch(
          `/api/fx?from=${encodeURIComponent(base)}&to=${encodeURIComponent(quote)}`,
          { signal: ac.signal }
        );
        const data = await readJsonResponse<{
          from?: string;
          to?: string;
          rate?: number;
          date?: string;
          error?: string;
        }>(res);
        if (!res.ok) {
          throw new Error(data.error || `FX lookup failed (${res.status}).`);
        }
        const rate = Number(data.rate);
        if (!Number.isFinite(rate) || rate <= 0) {
          throw new Error("Invalid FX rate from server.");
        }
        if (ac.signal.aborted) return;
        setState({
          quote: {
            from: String(data.from || base),
            to: String(data.to || quote),
            rate,
            date: String(data.date || "").slice(0, 10),
          },
          loading: false,
          error: null,
        });
      } catch (err) {
        if (ac.signal.aborted) return;
        setState({
          quote: null,
          loading: false,
          error: err instanceof Error ? err.message : "FX lookup failed.",
        });
      }
    })();

    return () => ac.abort();
  }, [base, quote]);

  return state;
}

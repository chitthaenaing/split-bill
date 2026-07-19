import { NextResponse } from "next/server";
import {
  fetchFrankfurterRate,
  isValidCurrencyCode,
  normalizeCurrency,
  type FxQuote,
} from "@/lib/frankfurter";

export const runtime = "nodejs";

/** In-memory cache — rates are daily; keep a few hours. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { quote: FxQuote; expiresAt: number }>();

function cacheKey(from: string, to: string) {
  return `${from}:${to}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = normalizeCurrency(searchParams.get("from") || "");
    const to = normalizeCurrency(searchParams.get("to") || "");

    if (!isValidCurrencyCode(from) || !isValidCurrencyCode(to)) {
      return NextResponse.json(
        { error: "Query params `from` and `to` must be ISO 4217 codes." },
        { status: 400 }
      );
    }

    const key = cacheKey(from, to);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return NextResponse.json(hit.quote, {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
          "X-FX-Cache": "HIT",
        },
      });
    }

    const quote = await fetchFrankfurterRate(from, to);
    cache.set(key, { quote, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json(quote, {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        "X-FX-Cache": "MISS",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error fetching FX rate.";
    console.error("[/api/fx]", err);
    const status = /422|404|Could not find/i.test(message) ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

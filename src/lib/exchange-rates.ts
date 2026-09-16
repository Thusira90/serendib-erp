import "server-only";
import { BASE_CURRENCY, CURRENCIES } from "@/lib/enums";

/**
 * Live exchange rates.
 *
 * Public shape (what routes and clients see):
 *   {
 *     base: "LKR",
 *     perUnit: { USD: 303, EUR: 335, ... },  // "1 <ccy> is worth N LKR"
 *     fetchedAt: "2026-09-16T…Z",
 *     source: "open.er-api.com" | "fallback",
 *   }
 *
 * The upstream (open.er-api.com) returns "1 base = N target". We flip it here
 * so consumers can multiply directly: `amountLKR = amount * perUnit[ccy]`.
 *
 * Cached in the module for 1h — free tier of open.er-api.com is once/hour.
 * The fallback rates are approximate and only used if the fetch fails outright.
 */

export type Rates = {
  base: string;
  perUnit: Record<string, number>;
  fetchedAt: string;
  source: "open.er-api.com" | "fallback";
};

// Approximate mid-2026 rates. 1 <code> ≈ N LKR. Used only when the API is
// unreachable; the UI clearly marks these as "cached" so the user knows the
// live feed didn't respond.
const FALLBACK_PER_UNIT: Record<string, number> = {
  LKR: 1,
  USD: 303,
  EUR: 335,
  GBP: 388,
  CHF: 345,
  JPY: 2.03,
  CNY: 42,
  HKD: 38.5,
  SGD: 235,
  AUD: 195,
  CAD: 220,
  NZD: 182,
  AED: 82,
  SAR: 80.5,
  INR: 3.5,
  THB: 8.5,
  MYR: 68,
  IDR: 0.0194,
  KRW: 0.222,
  ZAR: 17.3,
  BRL: 57.8,
};

const TTL_MS = 60 * 60 * 1000; // 1 hour
let cached: Rates | null = null;
let cachedAtMs = 0;
let inflight: Promise<Rates> | null = null;

async function fetchFromOpenErApi(): Promise<Rates> {
  const url = `https://open.er-api.com/v6/latest/${BASE_CURRENCY}`;
  const res = await fetch(url, {
    // Vercel's fetch cache honors next.revalidate — cache for an hour edge-side too.
    next: { revalidate: 60 * 60 },
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`open.er-api.com responded ${res.status}`);
  const data = (await res.json()) as {
    result?: string;
    base_code?: string;
    rates?: Record<string, number>;
    time_last_update_utc?: string;
  };
  if (data.result !== "success" || !data.rates || data.base_code !== BASE_CURRENCY) {
    throw new Error("open.er-api.com returned an unexpected payload");
  }

  // Upstream: `rates[c] = value of 1 base in c` — i.e. 1 LKR = rates.USD USD.
  // Flip to "1 c = N LKR" so multiplication converts foreign → base cleanly.
  const perUnit: Record<string, number> = { [BASE_CURRENCY]: 1 };
  for (const c of CURRENCIES) {
    if (c.code === BASE_CURRENCY) continue;
    const raw = data.rates[c.code];
    if (typeof raw === "number" && raw > 0) perUnit[c.code] = 1 / raw;
  }
  return {
    base: BASE_CURRENCY,
    perUnit,
    fetchedAt: data.time_last_update_utc ?? new Date().toISOString(),
    source: "open.er-api.com",
  };
}

function fallback(): Rates {
  return {
    base: BASE_CURRENCY,
    perUnit: { ...FALLBACK_PER_UNIT },
    fetchedAt: new Date().toISOString(),
    source: "fallback",
  };
}

export async function getExchangeRates(): Promise<Rates> {
  const now = Date.now();
  if (cached && now - cachedAtMs < TTL_MS) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const fresh = await fetchFromOpenErApi();
      cached = fresh;
      cachedAtMs = Date.now();
      return fresh;
    } catch {
      // Never surface a network error to the caller — a stale cache or the
      // baked-in fallback keeps the UI usable.
      if (cached) return cached;
      const fb = fallback();
      cached = fb;
      cachedAtMs = Date.now();
      return fb;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Multiply an amount in `ccy` into base currency (LKR). Returns null when unknown. */
export function toBase(rates: Rates, amount: number, ccy: string): number | null {
  if (!Number.isFinite(amount)) return null;
  if (ccy === rates.base) return amount;
  const per = rates.perUnit[ccy];
  return typeof per === "number" ? amount * per : null;
}

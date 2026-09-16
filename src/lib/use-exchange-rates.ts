"use client";

import { useEffect, useState } from "react";

export type ClientRates = {
  base: string;
  perUnit: Record<string, number>;
  fetchedAt: string;
  source: "open.er-api.com" | "fallback";
};

type State = { rates: ClientRates | null; loading: boolean; error: string | null };

// Module-level singleton so every mounted CurrencyInput shares one fetch and
// updates land in every subscriber at once (no per-input request storm).
let cache: ClientRates | null = null;
let cacheAt = 0;
let inflight: Promise<ClientRates> | null = null;
const subs = new Set<(s: State) => void>();

const TTL = 15 * 60 * 1000; // 15 min — the route itself caches for an hour.
const STORAGE_KEY = "sgs.exchangeRates.v1";

function loadSession(): ClientRates | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientRates & { _at?: number };
    if (parsed && parsed.base && parsed.perUnit) {
      cacheAt = parsed._at ?? Date.now();
      return parsed;
    }
  } catch {}
  return null;
}
function saveSession(r: ClientRates) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...r, _at: Date.now() }));
  } catch {}
}

async function fetchRates(): Promise<ClientRates> {
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch("/api/exchange-rates", { cache: "default" });
    if (!res.ok) throw new Error(`rates HTTP ${res.status}`);
    const data = (await res.json()) as ClientRates;
    cache = data;
    cacheAt = Date.now();
    saveSession(data);
    return data;
  })().finally(() => { inflight = null; });
  return inflight;
}

function notify(state: State) {
  subs.forEach((s) => s(state));
}

export function useExchangeRates(): State {
  const initial = cache ?? loadSession();
  if (initial && !cache) cache = initial;
  const [state, setState] = useState<State>({
    rates: cache,
    loading: !cache,
    error: null,
  });

  useEffect(() => {
    subs.add(setState);
    const fresh = cache && Date.now() - cacheAt < TTL;
    if (!fresh) {
      setState((s) => ({ ...s, loading: true, error: null }));
      fetchRates()
        .then((r) => notify({ rates: r, loading: false, error: null }))
        .catch((e: Error) => notify({ rates: cache, loading: false, error: e.message }));
    }
    return () => { subs.delete(setState); };
  }, []);

  return state;
}

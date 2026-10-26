// US dollar exchange rates for showing prices in other currencies. Daily ECB
// rates from Frankfurter, cached for 12 hours, with rough fallbacks so the
// app still converts when the source is down.

export const DISPLAY_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export interface FxRates {
  base: "USD";
  rates: Record<DisplayCurrency, number>;
  /** When the source published these rates, or null for the fallbacks. */
  asOf: string | null;
}

const FALLBACK: FxRates = { base: "USD", rates: { USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.37, AUD: 1.52 }, asOf: null };
const TTL_MS = 12 * 60 * 60 * 1000;

let cached: { at: number; value: FxRates } | null = null;

export async function getFxRates(fetchImpl: typeof fetch = fetch): Promise<FxRates> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const to = DISPLAY_CURRENCIES.filter((c) => c !== "USD").join(",");
    const res = await fetchImpl(`https://api.frankfurter.app/latest?from=USD&to=${to}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
    const rates = { ...FALLBACK.rates };
    for (const c of DISPLAY_CURRENCIES) {
      const r = body.rates?.[c];
      if (typeof r === "number" && r > 0) rates[c] = r;
    }
    const value: FxRates = { base: "USD", rates, asOf: body.date ?? null };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    // Try again in 10 minutes rather than hammering a source that's down.
    cached = { at: Date.now() - TTL_MS + 10 * 60 * 1000, value: cached?.value ?? FALLBACK };
    return cached.value;
  }
}

/** For tests. */
export function resetFxCache() {
  cached = null;
}

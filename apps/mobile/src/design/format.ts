// Prices come from the API in US dollars. They show in the currency picked in
// Settings, converted at the day's rate.

export type DisplayCurrency = "USD" | "EUR" | "GBP" | "CAD" | "AUD";

export const CURRENCIES: ReadonlyArray<{ code: DisplayCurrency; symbol: string; name: string }> = [
  { code: "USD", symbol: "$", name: "US dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British pound" },
  { code: "CAD", symbol: "CA$", name: "Canadian dollar" },
  { code: "AUD", symbol: "A$", name: "Australian dollar" },
];

let display = { code: "USD" as DisplayCurrency, symbol: "$", rate: 1 };

export function setDisplayCurrency(code: DisplayCurrency, rate: number) {
  const c = CURRENCIES.find((x) => x.code === code) ?? CURRENCIES[0];
  display = { code: c.code, symbol: c.symbol, rate: code === "USD" || !(rate > 0) ? 1 : rate };
}

export const displayCurrency = () => display.code;
export const displaySymbol = () => display.symbol;

/** An amount typed in the display currency, in US dollars (what the API filters on). */
export const displayToUsd = (amount: number) => amount / display.rate;

/** A US-dollar amount in the display currency, e.g. "$1,285" or "€54.20". */
export function formatUsd(amount: number | null | undefined, opts: { compact?: boolean; whole?: boolean } = {}): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const v = amount * display.rate;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (opts.compact && abs >= 10_000) {
    return `${sign}${display.symbol}${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  }
  const digits = opts.whole || abs >= 1000 ? 0 : 2;
  return `${sign}${display.symbol}${abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatDeltaPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%`;
}

export function setLabel(setId: string | null | undefined, collectorNumber?: string | null): string {
  if (!setId) return "";
  return collectorNumber ? `${setId.toUpperCase()} #${collectorNumber}` : setId.toUpperCase();
}

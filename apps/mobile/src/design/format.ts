export function formatUsd(amount: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  if (opts.compact && Math.abs(amount) >= 10_000) {
    return `$${(amount / 1000).toFixed(amount >= 100_000 ? 0 : 1)}k`;
  }
  const digits = Math.abs(amount) >= 1000 ? 0 : 2;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
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

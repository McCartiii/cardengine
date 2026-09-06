"use client";

import { useMemo } from "react";

const SERIES_COLORS: Record<string, string> = {
  "tcgplayer:market": "#4E93C8",
  "tcgplayer:foil": "#6BAADB",
  "cardmarket:market": "#E8B24A",
  "cardmarket:foil": "#FFD080",
  "mtgo:market": "#2FA98C",
};

const MARKET_LABEL: Record<string, string> = {
  tcgplayer: "TCGPlayer",
  cardmarket: "Cardmarket",
  mtgo: "Cardhoarder",
  cardkingdom: "Card Kingdom",
  cardsphere: "Cardsphere",
  manapool: "Mana Pool",
};

export interface ChartPoint {
  at: string;
  market: string;
  kind: string;
  currency: string;
  amount: number;
}

function keyOf(p: ChartPoint) {
  return `${p.market}:${p.kind}`;
}

export function FeaturedPriceChart({
  points,
  width = 720,
  height = 220,
}: {
  points: ChartPoint[];
  width?: number;
  height?: number;
}) {
  const usdPoints = useMemo(
    () => points.filter((p) => p.currency === "USD" && p.kind === "market"),
    [points]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ChartPoint[]>();
    const src = usdPoints.length > 0 ? usdPoints : points.filter((p) => p.kind === "market");
    for (const p of src) {
      const k = keyOf(p);
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    return map;
  }, [usdPoints, points]);

  const visible = useMemo(() => Array.from(grouped.values()).flat(), [grouped]);

  if (visible.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-surface-sunken">
        <p className="text-sm text-text-muted">Price history builds as daily snapshots land.</p>
      </div>
    );
  }

  const days = new Set(visible.map((p) => new Date(p.at).toDateString()));
  if (days.size <= 1) {
    const bars = Array.from(grouped.entries()).map(([key, pts]) => {
      const last = pts[pts.length - 1];
      return { key, ...last };
    });
    bars.sort((a, b) => a.amount - b.amount);
    const maxVal = Math.max(...bars.map((b) => b.amount), 0.01);
    return (
      <div className="space-y-2">
        {bars.map((bar) => {
          const color = SERIES_COLORS[bar.key] ?? "#4E93C8";
          const pct = (bar.amount / maxVal) * 100;
          return (
            <div key={bar.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-right text-xs font-medium text-text-secondary">
                {MARKET_LABEL[bar.market] ?? bar.market}
              </span>
              <div className="relative h-8 flex-1 overflow-hidden rounded-[var(--radius-sm)] bg-surface-sunken">
                <div
                  className="absolute inset-y-0 left-0 rounded-[var(--radius-sm)]"
                  style={{ width: `${Math.max(pct, 4)}%`, background: color, opacity: 0.85 }}
                />
              </div>
              <span className="w-20 shrink-0 font-stat text-sm font-semibold tabular-nums text-text-primary">
                {bar.currency === "EUR" ? "€" : "$"}
                {bar.amount.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  const amounts = visible.map((p) => p.amount);
  const rawMin = Math.min(...amounts);
  const rawMax = Math.max(...amounts);
  const range = rawMax - rawMin || 1;
  const minAmount = Math.max(0, rawMin - range * 0.12);
  const maxAmount = rawMax + range * 0.12;
  const times = visible.map((p) => new Date(p.at).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const pad = { top: 16, right: 16, bottom: 28, left: 48 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const scaleX = (t: number) =>
    maxTime === minTime ? pad.left + chartW / 2 : pad.left + ((t - minTime) / (maxTime - minTime)) * chartW;
  const scaleY = (v: number) =>
    pad.top + chartH - ((v - minAmount) / (maxAmount - minAmount || 1)) * chartH;
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks }, (_, i) => minAmount + ((maxAmount - minAmount) / (yTicks - 1)) * i);
  const xTicks = Math.min(5, days.size);
  const xLabels = Array.from({ length: xTicks }, (_, i) =>
    new Date(minTime + ((maxTime - minTime) / Math.max(1, xTicks - 1)) * i)
  );

  return (
    <>
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {yLabels.map((v, i) => (
        <g key={i}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={scaleY(v)}
            y2={scaleY(v)}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text
            x={pad.left - 8}
            y={scaleY(v) + 4}
            textAnchor="end"
            fill="var(--text-muted)"
            fontSize="10"
            fontFamily="var(--font-stat, ui-monospace)"
          >
            ${v.toFixed(v >= 10 ? 0 : 2)}
          </text>
        </g>
      ))}
      {xLabels.map((d, i) => (
        <text
          key={i}
          x={scaleX(d.getTime())}
          y={height - 8}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize="10"
        >
          {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </text>
      ))}
      {Array.from(grouped.entries()).map(([key, pts]) => {
        const color = SERIES_COLORS[key] ?? "#4E93C8";
        const d = pts
          .map((p, i) => {
            const cmd = i === 0 ? "M" : "L";
            return `${cmd}${scaleX(new Date(p.at).getTime()).toFixed(1)},${scaleY(p.amount).toFixed(1)}`;
          })
          .join(" ");
        return (
          <path
            key={key}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
    <div className="mt-2 flex flex-wrap gap-3">
      {Array.from(grouped.keys()).map((key) => (
        <span key={key} className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span
            className="h-1.5 w-4 rounded-full"
            style={{ background: SERIES_COLORS[key] ?? "#4E93C8" }}
          />
          {MARKET_LABEL[key.split(":")[0] ?? ""] ?? key}
        </span>
      ))}
    </div>
    </>
  );
}

export function marketLabel(market: string) {
  return MARKET_LABEL[market] ?? market;
}

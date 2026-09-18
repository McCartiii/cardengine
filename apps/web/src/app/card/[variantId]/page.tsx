"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { NavBar } from "@/components/ui/NavBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { SetSymbol } from "@/components/ui/SetSymbol";
import { CardImage } from "@/components/ui/CardImage";
import { ManaCost, ManaSymbol, ManaText } from "@/components/ui/ManaSymbols";
import { getIdentityStyle } from "@/lib/identity";
import {
  buildSmoothLinePath,
  interpolatePriceAtTime,
  nearestTimestamp,
} from "./price-chart-helpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardData {
  variantId: string;
  cardId: string;
  printingId: string;
  name: string;
  setId: string | null;
  collectorNumber: string | null;
  oracleText: string | null;
  typeLine: string | null;
  colors: string[] | null;
  colorIdentity: string[] | null;
  cmc: number | null;
  manaCost: string | null;
  rarity: string | null;
  imageUri: string | null;
}

interface StorePriceEntry {
  label: string;
  amount: number;
  currency: string;
}

interface StorePricing {
  store: string;
  prices: StorePriceEntry[];
  buyUrl: string | null;
}

interface PriceHistoryPoint {
  at: string;
  market: string;
  kind: string;
  currency: string;
  amount: number;
}

interface OtherPrinting {
  variantId: string;
  name: string;
  setId: string | null;
  collectorNumber: string | null;
  rarity: string | null;
  imageUri: string | null;
}

interface CardDetailResponse {
  card: CardData;
  storePricing: StorePricing[];
  pricingUpdatedAt: string | null;
  priceHistory: PriceHistoryPoint[];
  otherPrintings: OtherPrinting[];
  scryfallUrl: string;
  error?: string;
}

// ─── Color identity display ──────────────────────────────────────────────────

const COLOR_NAMES: Record<string, { name: string; bg: string }> = {
  W: { name: "White", bg: "bg-amber-200" },
  U: { name: "Blue", bg: "bg-blue-300" },
  B: { name: "Black", bg: "bg-[var(--mana-B)]" },
  R: { name: "Red", bg: "bg-red-400" },
  G: { name: "Green", bg: "bg-green-400" },
};

function ColorDots({ colors }: { colors: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {colors.map((color) => (
        <ManaSymbol key={color} symbol={`{${color}}`} />
      ))}
    </span>
  );
}

// ─── Rarity → Badge variant mapping ─────────────────────────────────────────

type RarityVariant = "mythic" | "rare" | "uncommon" | "common";

function toRarityVariant(rarity: string | null): RarityVariant {
  const r = rarity?.toLowerCase();
  if (r === "mythic" || r === "rare" || r === "uncommon" || r === "common") return r;
  return "common";
}

// ─── Store styling ───────────────────────────────────────────────────────────

type BadgeVariant = "tcg" | "mkm" | "ck" | "ebay" | "mtgo" | "default";

const STORE_CONFIG: Record<
  string,
  { badgeVariant: BadgeVariant; headerBg: string; accent: string; buyBtn: string }
> = {
  TCGplayer: {
    badgeVariant: "tcg",
    headerBg: "bg-[var(--market-tcg-bg)]",
    accent: "text-[var(--market-tcg)]",
    buyBtn: "bg-accent text-white hover:bg-accent-hover",
  },
  Cardmarket: {
    badgeVariant: "mkm",
    headerBg: "bg-[var(--market-mkm-bg)]",
    accent: "text-[var(--market-mkm)]",
    buyBtn: "bg-emerald-600 text-white hover:bg-emerald-700",
  },
  "Card Kingdom": {
    badgeVariant: "ck",
    headerBg: "bg-[var(--market-ck-bg)]",
    accent: "text-[var(--market-ck)]",
    buyBtn: "bg-blue-600 text-white hover:bg-blue-700",
  },
  eBay: {
    badgeVariant: "ebay",
    headerBg: "bg-[var(--market-ebay-bg)]",
    accent: "text-[var(--market-ebay)]",
    buyBtn: "bg-red-600 text-white hover:bg-red-700",
  },
  MTGGoldfish: {
    badgeVariant: "default",
    headerBg: "bg-amber-50",
    accent: "text-amber-700",
    buyBtn: "bg-amber-600 text-white hover:bg-amber-700",
  },
  Cardhoarder: {
    badgeVariant: "mtgo",
    headerBg: "bg-[var(--market-mtgo-bg)]",
    accent: "text-[var(--market-mtgo)]",
    buyBtn: "bg-purple-600 text-white hover:bg-purple-700",
  },
};

const DEFAULT_STORE_CONFIG = {
  badgeVariant: "default" as BadgeVariant,
  headerBg: "bg-surface-sunken",
  accent: "text-text-secondary",
  buyBtn: "bg-accent text-white hover:bg-accent-hover",
};

function currencyFormat(amount: number, currency: string): string {
  if (currency === "USD") return `$${amount.toFixed(2)}`;
  if (currency === "EUR") return `€${amount.toFixed(2)}`;
  if (currency === "TIX") return `${amount.toFixed(2)} tix`;
  return `${currency} ${amount.toFixed(2)}`;
}

// ─── Price chart helpers ─────────────────────────────────────────────────────

function marketDisplayName(market: string): string {
  switch (market) {
    case "tcgplayer":
      return "TCGplayer";
    case "cardmarket":
      return "Cardmarket";
    case "mtgo":
      return "MTGO";
    case "cardkingdom":
      return "Card Kingdom";
    case "cardsphere":
      return "Cardsphere";
    case "manapool":
      return "Mana Pool";
    default:
      return market;
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "market":
      return "Normal";
    case "foil":
      return "Foil";
    case "etched":
      return "Etched";
    default:
      return kind;
  }
}

function currencySymbol(currency: string): string {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  if (currency === "TIX") return "";
  return currency + " ";
}

function currencySuffix(currency: string): string {
  if (currency === "TIX") return " tix";
  return "";
}

// ─── SVG Price History Chart ─────────────────────────────────────────────────

const STORE_COLORS: Record<string, string> = {
  tcgplayer: "#8b7cf6",
  cardmarket: "#2dd4bf",
  mtgo: "#c084fc",
  cardkingdom: "#60a5fa",
  cardsphere: "#f472b6",
  manapool: "#fbbf24",
};

function seriesColor(key: string): string {
  return STORE_COLORS[key.split(":")[0]] ?? "#94a3b8";
}

const STORE_FOR_SERIES: Record<string, string> = {
  "tcgplayer:market": "TCGplayer",
  "tcgplayer:foil": "TCGplayer",
  "tcgplayer:etched": "TCGplayer",
  "cardmarket:market": "Cardmarket",
  "cardmarket:foil": "Cardmarket",
  "cardmarket:etched": "Cardmarket",
  "mtgo:market": "Cardhoarder",
  "cardkingdom:market": "Card Kingdom",
  "cardkingdom:foil": "Card Kingdom",
  "cardkingdom:etched": "Card Kingdom",
  "cardsphere:market": "Cardsphere",
  "cardsphere:foil": "Cardsphere",
  "manapool:market": "Mana Pool",
  "manapool:foil": "Mana Pool",
};

function PriceChart({
  points,
  hiddenSeries,
  width = 600,
  height = 260,
}: {
  points: PriceHistoryPoint[];
  hiddenSeries: Set<string>;
  width?: number;
  height?: number;
}) {
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, PriceHistoryPoint[]>();
    for (const p of points) {
      const key = `${p.market}:${p.kind}`;
      if (hiddenSeries.has(key)) continue;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [points, hiddenSeries]);

  const visiblePoints = useMemo(
    () => points.filter((p) => !hiddenSeries.has(`${p.market}:${p.kind}`)),
    [points, hiddenSeries]
  );

  const isSingleDay = useMemo(() => {
    if (visiblePoints.length === 0) return false;
    const days = new Set(visiblePoints.map((p) => new Date(p.at).toDateString()));
    return days.size <= 1;
  }, [visiblePoints]);

  if (visiblePoints.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-sunken">
        <div className="text-center">
          <p className="text-sm text-text-muted">No price history data yet</p>
          <p className="mt-1 text-xs text-text-muted/60">
            Price history builds over time as data is collected daily
          </p>
        </div>
      </div>
    );
  }

  // ─── BAR CHART: single-day snapshot comparing stores ───
  if (isSingleDay) {
    const bars = Array.from(grouped.entries()).map(([key, pts]) => {
      const latest = pts.reduce((a, b) =>
        new Date(b.at).getTime() > new Date(a.at).getTime() ? b : a
      );
      return { key, ...latest };
    });
    bars.sort((a, b) => b.amount - a.amount);

    const maxVal = Math.max(...bars.map((b) => b.amount));
    const barH = 36;
    const gap = 8;
    const labelW = 130;
    const valueW = 70;
    const totalH = bars.length * (barH + gap) + 40;

    return (
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="warning">Snapshot</Badge>
          <span className="text-[10px] text-text-muted">
            Today&apos;s prices across stores &mdash; history will build over time
          </span>
        </div>
        <div style={{ minHeight: totalH }}>
          {bars.map((bar) => {
            const color = seriesColor(bar.key);
            const pct = maxVal > 0 ? (bar.amount / maxVal) * 100 : 0;
            const [market, kind] = bar.key.split(":");
            return (
              <div
                key={bar.key}
                className="group flex items-center gap-2"
                style={{ height: barH, marginBottom: gap }}
              >
                <div className="shrink-0 text-right" style={{ width: labelW }}>
                  <span className="text-xs font-semibold text-text-secondary">
                    {marketDisplayName(market)}
                  </span>{" "}
                  <span className="text-[10px] text-text-muted">{kindLabel(kind)}</span>
                </div>
                <div className="relative flex-1 overflow-hidden rounded-md bg-surface-sunken" style={{ height: barH - 8 }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-md transition-all duration-500"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      backgroundColor: color,
                      opacity: 0.85,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-md opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <div className="shrink-0 text-right tabular-nums" style={{ width: valueW }}>
                  <span className="text-sm font-bold text-text-primary">
                    {currencySymbol(bar.currency)}{bar.amount.toFixed(2)}{currencySuffix(bar.currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── LINE CHART: multi-day price history ───
  const allAmounts = visiblePoints.map((p) => p.amount);
  const chartCurrency = visiblePoints[0]?.currency ?? "USD";
  const rawMin = Math.min(...allAmounts);
  const rawMax = Math.max(...allAmounts);
  const range = rawMax - rawMin || 1;
  const minAmount = Math.max(0, rawMin - range * 0.1);
  const maxAmount = rawMax + range * 0.1;

  const allTimes = visiblePoints.map((p) => new Date(p.at).getTime());
  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);

  const padding = { top: 20, right: 20, bottom: 32, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const scaleX = (t: number) =>
    maxTime === minTime
      ? padding.left + chartW / 2
      : padding.left + ((t - minTime) / (maxTime - minTime)) * chartW;
  const scaleY = (v: number) =>
    maxAmount === minAmount
      ? padding.top + chartH / 2
      : padding.top + chartH - ((v - minAmount) / (maxAmount - minAmount)) * chartH;

  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    return minAmount + ((maxAmount - minAmount) / (yTicks - 1)) * i;
  });

  const xTicks = Math.min(6, Math.max(2, new Set(allTimes).size));
  const xLabels = Array.from({ length: xTicks }, (_, i) => {
    const t = minTime + ((maxTime - minTime) / Math.max(1, xTicks - 1)) * i;
    return new Date(t);
  });
  const observedTimes = Array.from(new Set(allTimes)).sort((a, b) => a - b);
  const hoverEntries =
    hoveredTime === null
      ? []
      : Array.from(grouped.entries()).flatMap(([key, seriesPoints]) => {
          const interpolation = interpolatePriceAtTime(
            seriesPoints.map((point) => ({
              time: new Date(point.at).getTime(),
              amount: point.amount,
            })),
            hoveredTime
          );
          const series = seriesPoints[0];
          return interpolation && series
            ? [{ key, series, ...interpolation }]
            : [];
        });

  return (
    <div
      className="relative"
      onMouseLeave={() => setHoveredTime(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-pan-y"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {yLabels.map((v, i) => (
          <g key={`y-${i}`}>
            <line
              x1={padding.left}
              y1={scaleY(v)}
              x2={width - padding.right}
              y2={scaleY(v)}
              stroke="currentColor"
              className="text-border"
              strokeWidth={0.5}
            />
            <text
              x={padding.left - 8}
              y={scaleY(v) + 4}
              textAnchor="end"
              className="fill-text-muted text-[10px]"
            >
              {currencySymbol(chartCurrency)}{v.toFixed(2)}{currencySuffix(chartCurrency)}
            </text>
          </g>
        ))}

        {/* X-axis date labels */}
        {xLabels.map((d, i) => (
          <text
            key={`x-${i}`}
            x={scaleX(d.getTime())}
            y={height - 5}
            textAnchor="middle"
            className="fill-text-muted text-[10px]"
          >
            {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </text>
        ))}

        {/* Solid, continuous store lines. Finishes are separated by the
            controls above rather than encoded as hard-to-track dash styles. */}
        {Array.from(grouped.entries()).map(([key, pts]) => {
          const sorted = [...pts].sort(
            (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
          );
          const color = seriesColor(key);
          const pathData = buildSmoothLinePath(
            sorted.map((point) => ({
              x: scaleX(new Date(point.at).getTime()),
              y: scaleY(point.amount),
            }))
          );

          return (
            <g key={key}>
              <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}

        {hoveredTime !== null && (
          <g className="pointer-events-none">
            {hoverEntries.map(({ key, amount }) => (
              <g key={key}>
                <circle
                  cx={scaleX(hoveredTime)}
                  cy={scaleY(amount)}
                  r={6}
                  fill="var(--surface)"
                  stroke={seriesColor(key)}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={scaleX(hoveredTime)}
                  cy={scaleY(amount)}
                  r={2.5}
                  fill={seriesColor(key)}
                />
              </g>
            ))}
          </g>
        )}

        <rect
          x={padding.left}
          y={padding.top}
          width={chartW}
          height={chartH}
          fill="transparent"
          className="cursor-crosshair"
          role="slider"
          tabIndex={0}
          aria-label="Price history date"
          aria-valuemin={minTime}
          aria-valuemax={maxTime}
          aria-valuenow={hoveredTime ?? maxTime}
          aria-valuetext={new Date(hoveredTime ?? maxTime).toLocaleDateString(
            "en-US",
            { month: "long", day: "numeric", year: "numeric" }
          )}
          onFocus={() => setHoveredTime(observedTimes.at(-1) ?? null)}
          onBlur={() => setHoveredTime(null)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
              return;
            }
            event.preventDefault();
            const currentIndex =
              hoveredTime === null
                ? observedTimes.length - 1
                : observedTimes.indexOf(
                    nearestTimestamp(observedTimes, hoveredTime) ?? maxTime
                  );
            const direction = event.key === "ArrowRight" ? 1 : -1;
            const nextIndex = Math.min(
              observedTimes.length - 1,
              Math.max(0, currentIndex + direction)
            );
            setHoveredTime(observedTimes[nextIndex] ?? null);
          }}
          onPointerMove={(event) => {
            const bounds =
              event.currentTarget.ownerSVGElement?.getBoundingClientRect();
            if (!bounds) return;
            const viewBoxX =
              ((event.clientX - bounds.left) / bounds.width) * width;
            const clampedX = Math.min(
              padding.left + chartW,
              Math.max(padding.left, viewBoxX)
            );
            const targetTime =
              minTime +
              ((clampedX - padding.left) / chartW) * (maxTime - minTime);
            setHoveredTime(targetTime);
          }}
          onPointerLeave={(event) => {
            if (document.activeElement !== event.currentTarget) {
              setHoveredTime(null);
            }
          }}
        />
      </svg>

      {hoveredTime !== null && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 min-w-40 rounded-xl border border-border bg-surface/95 px-3 py-2.5 shadow-[var(--shadow-elevated)] backdrop-blur">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {new Date(hoveredTime).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <div className="space-y-1.5">
            {hoverEntries.map(
              ({ key, series, amount, fromTime, toTime, exact }) => (
              <div key={key}>
                <div className="flex items-center justify-between gap-5">
                  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: seriesColor(key) }}
                    />
                    {marketDisplayName(series.market)}
                  </span>
                  <span className="font-stat text-xs font-bold tabular-nums text-text-primary">
                    {currencySymbol(series.currency)}
                    {amount.toFixed(2)}
                    {currencySuffix(series.currency)}
                  </span>
                </div>
                <p className="ml-3.5 text-[9px] text-text-muted">
                  {exact || fromTime === toTime ? "observed " : "between "}
                  {new Date(fromTime).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  {fromTime !== toTime && (
                    <>
                      {" – "}
                      {new Date(toTime).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </>
                  )}
                </p>
              </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartLegend({
  points,
  hiddenSeries,
  onToggle,
}: {
  points: PriceHistoryPoint[];
  hiddenSeries: Set<string>;
  onToggle: (key: string) => void;
}) {
  const seriesByStore = useMemo(() => {
    const keys = new Set<string>();
    for (const p of points) keys.add(`${p.market}:${p.kind}`);

    const storeMap = new Map<string, string[]>();
    for (const key of keys) {
      const store = STORE_FOR_SERIES[key] ?? key.split(":")[0];
      const arr = storeMap.get(store) ?? [];
      arr.push(key);
      storeMap.set(store, arr);
    }
    return storeMap;
  }, [points]);

  if (seriesByStore.size === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        Stores
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {Array.from(seriesByStore.entries()).map(([, keys]) =>
          keys.map((key) => {
            const [market] = key.split(":");
            const color = seriesColor(key);
            const isHidden = hiddenSeries.has(key);
            return (
              <button
                key={key}
                onClick={() => onToggle(key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                  isHidden
                    ? "border-border opacity-40 hover:opacity-70"
                    : "border-border bg-surface-sunken opacity-100 hover:border-border-strong"
                }`}
                aria-pressed={!isHidden}
              >
                <span
                  className="inline-block h-0.5 w-4 rounded-full"
                  style={{
                    backgroundColor: color,
                  }}
                />
                <span className="text-text-secondary">
                  {marketDisplayName(market)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function CardDetailPage() {
  const params = useParams<{ variantId: string }>();
  const router = useRouter();
  const [data, setData] = useState<CardDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyDays, setHistoryDays] = useState(365);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeSinceUpdate, setTimeSinceUpdate] = useState("");
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [chartFinish, setChartFinish] = useState<
    "market" | "foil" | "etched"
  >("market");
  const [chartCurrency, setChartCurrency] = useState("USD");
  const initializedChartVariant = useRef<string | null>(null);
  const [user, setUser] = useState<{ email?: string } | null>(null);

  // Load user for NavBar
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ? { email: u.email ?? undefined } : null);
    });
  }, []);

  // Decode the param
  const variantId = useMemo(() => {
    try {
      return decodeURIComponent(params.variantId ?? "");
    } catch {
      return params.variantId ?? "";
    }
  }, [params.variantId]);

  const fetchCard = useCallback(async (isRefresh = false) => {
    if (!variantId) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/v1/cards/${encodeURIComponent(variantId)}?historyDays=${historyDays}`,
        { signal: AbortSignal.timeout(15_000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setData(json);
        setLastUpdated(
          json.pricingUpdatedAt ? new Date(json.pricingUpdatedAt) : null
        );
        if (initializedChartVariant.current !== variantId) {
          const history = (json.priceHistory ?? []) as PriceHistoryPoint[];
          const availableKinds = new Set(
            history
              .map((point) => point.kind)
              .filter((kind) => ["market", "foil", "etched"].includes(kind))
          );
          const preferredKind = variantId.endsWith("-foil")
            ? "foil"
            : "market";
          const initialKind = availableKinds.has(preferredKind)
            ? preferredKind
            : ["market", "foil", "etched"].find((kind) =>
                availableKinds.has(kind)
              );
          if (initialKind) {
            setChartFinish(initialKind as "market" | "foil" | "etched");
            const currenciesForFinish = new Set(
              history
                .filter((point) => point.kind === initialKind)
                .map((point) => point.currency)
            );
            const initialCurrency = currenciesForFinish.has("USD")
              ? "USD"
              : currenciesForFinish.has("EUR")
                ? "EUR"
                : currenciesForFinish.values().next().value;
            if (initialCurrency) setChartCurrency(initialCurrency);
          }
          initializedChartVariant.current = variantId;
        }
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.name === "TimeoutError"
          ? "Card detail timed out — try again"
          : e instanceof Error
            ? e.message
            : "Failed to fetch card";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [variantId, historyDays]);

  useEffect(() => {
    fetchCard();
  }, [fetchCard]);

  // Auto-refresh prices every 5 minutes
  useEffect(() => {
    if (!variantId) return;
    const interval = setInterval(() => fetchCard(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [variantId, fetchCard]);

  // Update "time since" display every second
  useEffect(() => {
    if (!lastUpdated) return;
    function updateTimeSince() {
      if (!lastUpdated) return;
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (seconds < 5) setTimeSinceUpdate("just now");
      else if (seconds < 60) setTimeSinceUpdate(`${seconds}s ago`);
      else if (seconds < 3600) setTimeSinceUpdate(`${Math.floor(seconds / 60)}m ago`);
      else setTimeSinceUpdate(`${Math.floor(seconds / 3600)}h ago`);
    }
    updateTimeSince();
    const interval = setInterval(updateTimeSince, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const finishSummaries = useMemo(() => {
    if (!data) return [];
    const candidates = data.storePricing.flatMap((store) =>
      store.prices
        .filter((price) => price.amount > 0)
        .map((price) => ({ store: store.store, ...price }))
    );
    return [
      { kind: "market", label: "Non-foil", priceLabel: "Normal" },
      { kind: "foil", label: "Foil", priceLabel: "Foil" },
      { kind: "etched", label: "Etched", priceLabel: "Etched" },
    ]
      .map((finish) => {
        const matching = candidates.filter(
          (price) =>
            price.label === finish.priceLabel ||
            (finish.kind === "market" && price.label === "Market")
        );
        const cheapest = (currency: string) => {
          const prices = matching.filter(
            (price) => price.currency === currency
          );
          return prices.length > 0
            ? prices.reduce((a, b) => (a.amount < b.amount ? a : b))
            : null;
        };
        return {
          ...finish,
          usd: cheapest("USD"),
          eur: cheapest("EUR"),
        };
      })
      .filter(
        (finish) =>
          finish.kind !== "etched" || finish.usd !== null || finish.eur !== null
      );
  }, [data]);

  const availableHistoryFinishes = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(
      data.priceHistory
        .map((point) => point.kind)
        .filter((kind) => ["market", "foil", "etched"].includes(kind))
    );
  }, [data]);

  const availableHistoryCurrencies = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(
      data.priceHistory
        .filter((point) => point.kind === chartFinish)
        .map((point) => point.currency)
    );
  }, [chartFinish, data]);

  const effectiveChartCurrency = availableHistoryCurrencies.has(chartCurrency)
    ? chartCurrency
    : (availableHistoryCurrencies.values().next().value ?? chartCurrency);

  const visiblePriceHistory = useMemo(
    () =>
      data?.priceHistory.filter(
        (point) =>
          point.kind === chartFinish &&
          point.currency === effectiveChartCurrency
      ) ??
      [],
    [chartFinish, data, effectiveChartCurrency]
  );

  // Compare like-for-like finishes only. A foil price is not a valid substitute
  // for a nonfoil copy (and vice versa).
  const headlinePrice = useMemo(() => {
    if (!data) return null;
    const candidates: Array<{ store: string; label: string; amount: number; currency: string }> = [];
    for (const sp of data.storePricing) {
      for (const p of sp.prices) {
        if (p.amount > 0) candidates.push({ store: sp.store, ...p });
      }
    }
    const preferredLabels = data.card.variantId.endsWith("-foil")
      ? new Set(["Foil"])
      : new Set(["Normal", "Market"]);
    const matchingFinish = candidates.filter((p) => preferredLabels.has(p.label));
    const matchingUsd = matchingFinish.filter((p) => p.currency === "USD");
    const matchingEur = matchingFinish.filter((p) => p.currency === "EUR");
    const list =
      matchingUsd.length > 0
        ? matchingUsd
        : matchingEur.length > 0
          ? matchingEur
          : matchingFinish;
    if (list.length === 0) return null;
    return list.reduce((a, b) => (a.amount < b.amount ? a : b));
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <NavBar user={user} />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <Skeleton className="h-5 w-32 mb-6" />
          <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
            <Skeleton className="h-[440px] w-full rounded-2xl" />
            <div className="space-y-6">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-40 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg">
        <NavBar user={user} />
        <div className="flex flex-1 flex-col items-center justify-center py-32 animate-fade-in">
          <p className="text-lg text-[var(--danger-text)]">{error ?? "Card not found"}</p>
          <Button onClick={() => router.back()} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const { card, storePricing, otherPrintings, scryfallUrl } =
    data;

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      <main className="mx-auto max-w-7xl px-6 py-8 animate-fade-in">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to search
        </button>

        {/* ─── Top section: Image + Info ─── */}
        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          {/* Card image */}
          <div className="flex flex-col items-center gap-4 animate-scale-in">
            {card.imageUri ? (
              <div
                className="rounded-xl overflow-hidden"
                style={getIdentityStyle(card.colorIdentity ?? [])}
              >
                <CardImage
                  src={card.imageUri}
                  alt={card.name}
                  priority
                  className="w-full max-w-[320px] rounded-2xl shadow-[var(--shadow-elevated)]"
                  wrapperClassName="rounded-2xl max-w-[320px] w-full"
                />
              </div>
            ) : (
              <div className="flex h-[440px] w-full max-w-[320px] items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-sunken">
                <span className="text-text-muted">No image</span>
              </div>
            )}

            {/* Scryfall link */}
            <a
              href={scryfallUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              View on Scryfall
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>

          {/* Card details */}
          <div className="flex flex-col gap-6">
            {/* Name, mana, type */}
            <div className="animate-slide-up">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold text-text-primary">
                  {card.name}
                </h1>
                {card.manaCost && <ManaCost cost={card.manaCost} />}
                {headlinePrice && (
                  <span className="ml-auto text-2xl font-bold text-accent-text">
                    {currencyFormat(headlinePrice.amount, headlinePrice.currency)}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {card.typeLine && (
                  <span className="text-sm text-text-secondary">
                    {card.typeLine}
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {card.rarity && (
                  <Badge variant={toRarityVariant(card.rarity)} className="capitalize" setCode={card.setId ?? undefined}>
                    {card.rarity}
                  </Badge>
                )}
                {card.setId && (
                  <div className="flex items-center gap-2 mt-1">
                    <SetSymbol setCode={card.setId} rarity={card.rarity} size={16} />
                    <span className="text-sm text-text-secondary font-mono">
                      {card.setId.toUpperCase()} {card.collectorNumber}
                    </span>
                  </div>
                )}
                {card.colors && card.colors.length > 0 && (
                  <ColorDots colors={card.colors as string[]} />
                )}
                {card.cmc != null && (
                  <Badge variant="default">CMC {card.cmc}</Badge>
                )}
              </div>
            </div>

            {/* Oracle text */}
            {card.oracleText && (
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] animate-slide-up" style={{ animationDelay: "50ms" }}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Card Text
                </h2>
                <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-text-primary">
                  <ManaText text={card.oracleText} />
                </div>
              </div>
            )}

            {/* ─── PRICING ─── */}
            {(() => {
              const storesWithPrices = storePricing.filter((sp) => sp.prices.length > 0);
              const storesWithoutPrices = storePricing.filter((sp) => sp.prices.length === 0 && sp.buyUrl);
              return (
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] animate-slide-up" style={{ animationDelay: "100ms" }}>
                  {/* Header with source freshness + refresh */}
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Current Price Estimates
                      </h2>
                      {lastUpdated && (
                        <Badge variant="success" className="gap-1.5">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                          </span>
                          Updated {timeSinceUpdate}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => fetchCard(true)}
                      loading={refreshing}
                      icon={
                        <svg
                          className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      }
                    >
                      {refreshing ? "Refreshing..." : "Refresh"}
                    </Button>
                  </div>

                  <div
                    className={`mb-4 grid gap-3 ${
                      finishSummaries.length > 2
                        ? "sm:grid-cols-3"
                        : "sm:grid-cols-2"
                    }`}
                  >
                    {finishSummaries.map((finish) => (
                      <div
                        key={finish.kind}
                        className="rounded-[var(--radius-md)] border border-border bg-surface-sunken px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                            {finish.label}
                          </p>
                          {finish.kind ===
                            (card.variantId.endsWith("-foil")
                              ? "foil"
                              : "market") && (
                            <Badge variant="accent">This copy</Badge>
                          )}
                        </div>
                        <div className="mt-2">
                          <p className="font-stat text-xl font-bold tabular-nums text-text-primary">
                            {finish.usd
                              ? currencyFormat(finish.usd.amount, "USD")
                              : "—"}
                          </p>
                          <p className="text-[11px] text-text-secondary">
                            {finish.usd
                              ? `${finish.usd.store} · lowest USD estimate`
                              : "No USD estimate"}
                          </p>
                        </div>
                        {finish.eur && (
                          <p className="mt-2 border-t border-border pt-2 font-stat text-xs text-text-muted">
                            {currencyFormat(finish.eur.amount, "EUR")} ·{" "}
                            {finish.eur.store}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Stores with current price estimates */}
                  <div className="space-y-3">
                    {storesWithPrices.map((sp) => {
                      const config = STORE_CONFIG[sp.store] ?? DEFAULT_STORE_CONFIG;
                      return (
                        <div
                          key={sp.store}
                          className="overflow-hidden rounded-xl border border-border"
                        >
                          <div className={`flex items-center justify-between px-4 py-3 ${config.headerBg}`}>
                            <h3 className={`text-sm font-bold ${config.accent}`}>
                              {sp.store}
                            </h3>
                            {sp.buyUrl && (
                              <a
                                href={sp.buyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-90 ${config.buyBtn}`}
                              >
                                Buy Now
                              </a>
                            )}
                          </div>
                          <div className="divide-y divide-border">
                            {sp.prices.map((p) => {
                              const isBest =
                                headlinePrice &&
                                sp.store === headlinePrice.store &&
                                p.label === headlinePrice.label &&
                                p.currency === headlinePrice.currency &&
                                p.amount === headlinePrice.amount;
                              return (
                              <div
                                key={`${sp.store}-${p.label}-${p.currency}`}
                                className={`flex items-center justify-between px-4 py-2.5 ${isBest ? "bg-accent-light" : ""}`}
                              >
                                <div className="flex items-center gap-2">
                                  <Badge variant={config.badgeVariant}>
                                    {p.label}
                                  </Badge>
                                  <span className="text-[10px] text-text-muted">
                                    {p.currency}
                                  </span>
                                  {isBest && (
                                    <Badge variant="success">Lowest</Badge>
                                  )}
                                </div>
                                <span className="text-base font-bold tabular-nums text-text-primary">
                                  {currencyFormat(p.amount, p.currency)}
                                </span>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Compact "Buy Elsewhere" links */}
                  {storesWithoutPrices.length > 0 && (
                    <div className="mt-4 rounded-xl border border-border bg-surface-sunken p-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        Also check prices on
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {storesWithoutPrices.map((sp) => {
                          const config = STORE_CONFIG[sp.store] ?? DEFAULT_STORE_CONFIG;
                          return (
                            <a
                              key={sp.store}
                              href={sp.buyUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 ${config.buyBtn}`}
                            >
                              {sp.store}
                              <svg className="h-3 w-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ─── Price History Chart ─── */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] animate-slide-up" style={{ animationDelay: "150ms" }}>
              <div className="mb-5 space-y-4">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Price History
                  </h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    {kindLabel(chartFinish)} · {effectiveChartCurrency} · slide
                    anywhere to track prices
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-text-muted">
                      Finish
                    </p>
                    <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-0.5">
                      {(["market", "foil", "etched"] as const)
                        .filter((kind) => availableHistoryFinishes.has(kind))
                        .map((kind) => (
                          <button
                            key={kind}
                            onClick={() => {
                              setChartFinish(kind);
                              setHiddenSeries(new Set());
                            }}
                            aria-pressed={chartFinish === kind}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                              chartFinish === kind
                                ? "bg-accent-light text-accent-text shadow-sm ring-1 ring-inset ring-accent/40"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                          >
                            {kind === "market"
                              ? "Non-foil"
                              : kind === "foil"
                                ? "Foil"
                                : "Etched"}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-text-muted">
                      Currency
                    </p>
                    <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-0.5">
                      {(["USD", "EUR"] as const)
                        .filter((currency) =>
                          availableHistoryCurrencies.has(currency)
                        )
                        .map((currency) => (
                          <button
                            key={currency}
                            onClick={() => setChartCurrency(currency)}
                            aria-pressed={effectiveChartCurrency === currency}
                            className={`rounded-md px-2.5 py-1.5 font-stat text-xs font-semibold transition-colors ${
                              effectiveChartCurrency === currency
                                ? "bg-surface-raised text-text-primary shadow-sm"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                          >
                            {currency}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="sm:ml-auto">
                    <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-text-muted">
                      Range
                    </p>
                    <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-0.5">
                      {[30, 90, 180, 365].map((days) => (
                        <button
                          key={days}
                          onClick={() => setHistoryDays(days)}
                          aria-pressed={historyDays === days}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            historyDays === days
                              ? "bg-surface-raised text-text-primary shadow-sm"
                              : "text-text-muted hover:text-text-primary"
                          }`}
                        >
                          {days}d
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <PriceChart points={visiblePriceHistory} hiddenSeries={hiddenSeries} />
              <ChartLegend points={visiblePriceHistory} hiddenSeries={hiddenSeries} onToggle={toggleSeries} />
            </div>

            {/* ─── Card Details Grid ─── */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] animate-slide-up" style={{ animationDelay: "200ms" }}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Card Details
              </h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-text-muted">Name</dt>
                  <dd className="font-medium text-text-primary">
                    {card.name}
                  </dd>
                </div>
                {card.typeLine && (
                  <div>
                    <dt className="text-text-muted">Type</dt>
                    <dd className="font-medium text-text-primary">
                      {card.typeLine}
                    </dd>
                  </div>
                )}
                {card.manaCost && (
                  <div>
                    <dt className="text-text-muted">Mana Cost</dt>
                    <dd className="pt-1 font-medium text-text-primary">
                      <ManaCost cost={card.manaCost} />
                    </dd>
                  </div>
                )}
                {card.cmc != null && (
                  <div>
                    <dt className="text-text-muted">CMC</dt>
                    <dd className="font-medium text-text-primary">
                      {card.cmc}
                    </dd>
                  </div>
                )}
                {card.rarity && (
                  <div>
                    <dt className="text-text-muted">Rarity</dt>
                    <dd className="font-medium capitalize text-text-primary">
                      {card.rarity}
                    </dd>
                  </div>
                )}
                {card.setId && (
                  <div>
                    <dt className="text-text-muted">Set</dt>
                    <dd className="font-medium text-text-primary">
                      {card.setId.toUpperCase()}
                    </dd>
                  </div>
                )}
                {card.collectorNumber && (
                  <div>
                    <dt className="text-text-muted">Collector #</dt>
                    <dd className="font-medium text-text-primary">
                      {card.collectorNumber}
                    </dd>
                  </div>
                )}
                {card.colors && card.colors.length > 0 && (
                  <div>
                    <dt className="text-text-muted">Colors</dt>
                    <dd className="mt-1 flex flex-col items-start gap-1 font-medium text-text-primary">
                      <ColorDots colors={card.colors as string[]} />
                      <span className="text-xs leading-snug">
                        {(card.colors as string[])
                          .map((c) => COLOR_NAMES[c]?.name ?? c)
                          .join(", ")}
                      </span>
                    </dd>
                  </div>
                )}
                {card.colorIdentity &&
                  (card.colorIdentity as string[]).length > 0 && (
                    <div>
                      <dt className="text-text-muted">Color Identity</dt>
                      <dd className="mt-1 flex flex-col items-start gap-1 font-medium text-text-primary">
                        <ColorDots
                          colors={card.colorIdentity as string[]}
                        />
                        <span className="text-xs leading-snug">
                          {(card.colorIdentity as string[])
                            .map((c) => COLOR_NAMES[c]?.name ?? c)
                            .join(", ")}
                        </span>
                      </dd>
                    </div>
                  )}
              </dl>
            </div>

            {/* ─── Other Printings ─── */}
            {otherPrintings.length > 0 && (
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] animate-slide-up" style={{ animationDelay: "250ms" }}>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Other Printings ({otherPrintings.length})
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {otherPrintings.map((p) => (
                    <Link
                      key={p.variantId}
                      href={`/card/${encodeURIComponent(p.variantId)}`}
                      className="group overflow-hidden rounded-xl border border-border transition-all hover:border-accent hover:shadow-[var(--shadow-card-hover)] card-hover"
                    >
                      {p.imageUri ? (
                        <CardImage
                          src={p.imageUri}
                          alt={`${p.name} (${p.setId?.toUpperCase()})`}
                          className="w-full"
                          wrapperClassName="w-full rounded-xl"
                        />
                      ) : (
                        <div className="flex h-24 items-center justify-center bg-surface-sunken">
                          <span className="text-xs text-text-muted">
                            {p.setId?.toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="p-2 text-center">
                        <span className="text-xs font-medium text-text-secondary group-hover:text-accent-text">
                          {p.setId?.toUpperCase()} #{p.collectorNumber}
                        </span>
                        {p.rarity && (
                          <Badge variant={toRarityVariant(p.rarity)} className="ml-1 text-[10px] capitalize">
                            {p.rarity}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

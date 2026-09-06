"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type MarketHome, type MarketCard } from "@/lib/api";
import { CardTile } from "@/components/ui/CardTile";
import { CardImage } from "@/components/ui/CardImage";
import { Sparkline } from "@/components/ui/Sparkline";
import { FeaturedPriceChart, marketLabel } from "@/components/home/FeaturedPriceChart";

function SectionTitle({
  kicker,
  title,
  hint,
}: {
  kicker: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-text">{kicker}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">{title}</h2>
      </div>
      {hint && <p className="max-w-sm text-right text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function formatUsd(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function MoverRow({ card }: { card: MarketCard }) {
  const up = (card.deltaPct ?? 0) > 0;
  return (
    <Link
      href={`/card/${encodeURIComponent(card.variantId)}`}
      className="group grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-raised"
    >
      {card.imageUri ? (
        <CardImage
          src={card.imageUri}
          alt=""
          foil={false}
          wrapperClassName="h-12 w-9 shrink-0"
          className="h-12 w-9 rounded-[4px] object-cover"
        />
      ) : (
        <div className="h-12 w-9 rounded-[4px] bg-surface-sunken" />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text-primary">{card.name}</p>
        <p className="font-stat text-[10px] uppercase tracking-wide text-text-muted">
          {[card.setId?.toUpperCase(), card.collectorNumber ? `#${card.collectorNumber}` : null]
            .filter(Boolean)
            .join(" · ")}
          {card.bestMarket ? ` · ${marketLabel(card.bestMarket)}` : ""}
        </p>
      </div>
      <Sparkline values={card.sparkline} />
      <div className="text-right">
        <p className="font-stat text-sm font-semibold tabular-nums text-text-primary">
          {formatUsd(card.bestUsd ?? card.priceUsd)}
        </p>
        {card.deltaPct != null && (
          <p
            className={`font-stat text-[11px] font-medium ${
              up ? "text-[var(--success-text)]" : "text-[var(--danger-text)]"
            }`}
          >
            {up ? "+" : ""}
            {card.deltaPct.toFixed(1)}%
          </p>
        )}
      </div>
    </Link>
  );
}

function CardGrid({ cards }: { cards: MarketCard[] }) {
  if (cards.length === 0) {
    return <p className="text-sm text-text-muted">No cards to show yet — prices populate after ingest.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {cards.map((c) => (
        <CardTile
          key={c.variantId}
          variantId={c.variantId}
          name={c.name}
          imageUri={c.imageUri}
          setId={c.setId}
          collectorNumber={c.collectorNumber}
          rarity={c.rarity}
          priceUsd={c.bestUsd ?? c.priceUsd}
          priceDeltaPct={c.deltaPct}
        />
      ))}
    </div>
  );
}

export function HomeMarket() {
  const [data, setData] = useState<MarketHome | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.market
      .home()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Could not load market data");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <p className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-6 text-center text-sm text-text-muted">
          Market data is unavailable right now. Collection and search still work.
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="h-64 animate-pulse rounded-[var(--radius-xl)] bg-surface" />
      </section>
    );
  }

  const featured = data.featured;
  const gainers = data.movers.filter((m) => (m.deltaPct ?? 0) > 0).slice(0, 8);
  const losers = data.movers.filter((m) => (m.deltaPct ?? 0) < 0).slice(0, 8);
  const moversLeft = gainers.length > 0 ? gainers : data.movers.slice(0, 8);
  const moversRight = losers.length > 0 ? losers : data.movers.slice(8, 16);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-16 px-6 pb-24">
      {featured && (
        <section>
          <SectionTitle
            kicker="Daily market estimate"
            title="Multi-market price chart"
            hint="Retail estimates from MTGJSON providers, matched to the exact printing and finish."
          />
          <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface">
            <div className="flex flex-col gap-6 p-5 md:flex-row md:items-start">
              <Link
                href={`/card/${encodeURIComponent(featured.card.variantId)}`}
                className="mx-auto w-36 shrink-0 md:mx-0"
              >
                {featured.card.imageUri ? (
                  <CardImage
                    src={featured.card.imageUri}
                    alt={featured.card.name}
                    foil={false}
                    wrapperClassName="w-full"
                    className="w-full rounded-[var(--radius-md)] shadow-[var(--shadow-card)]"
                  />
                ) : null}
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/card/${encodeURIComponent(featured.card.variantId)}`}
                  className="text-xl font-bold text-text-primary hover:text-accent-text"
                >
                  {featured.card.name}
                </Link>
                <p className="mt-1 font-stat text-xs uppercase tracking-wide text-text-muted">
                  {[featured.card.setId?.toUpperCase(), featured.card.collectorNumber]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-4 flex flex-wrap items-end gap-6">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-text">
                      Lowest estimate
                    </p>
                    <p className="font-stat text-3xl font-bold tabular-nums text-text-primary">
                      {formatUsd(featured.card.bestUsd ?? featured.card.priceUsd)}
                    </p>
                    {featured.card.bestMarket && (
                      <p className="text-xs text-text-secondary">
                        {marketLabel(featured.card.bestMarket)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {featured.card.prices
                      .filter((p) => p.kind === "market")
                      .map((p) => (
                        <span
                          key={`${p.market}-${p.currency}`}
                          className="rounded-[var(--radius-sm)] border border-border bg-surface-raised px-2.5 py-1 font-stat text-xs text-text-secondary"
                        >
                          {marketLabel(p.market)} {p.currency === "EUR" ? "€" : p.currency === "TIX" ? "" : "$"}
                          {p.amount.toFixed(2)}
                          {p.currency === "TIX" ? " tix" : ""}
                        </span>
                      ))}
                  </div>
                </div>
                <div className="mt-5">
                  <FeaturedPriceChart points={featured.history} />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          kicker="Market"
          title="Top movers"
          hint="14-day change on TCGPlayer USD, ranked by percent move."
        />
        {data.movers.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
            Movers appear after at least two daily price snapshots. Check back after the next ingest.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--success-text)]">
                {gainers.length > 0 ? "Gainers" : "Largest moves"}
              </p>
              {moversLeft.map((c) => (
                <MoverRow key={c.variantId} card={c} />
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--danger-text)]">
                {losers.length > 0 ? "Decliners" : "More movers"}
              </p>
              {moversRight.map((c) => (
                <MoverRow key={c.variantId} card={c} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <SectionTitle kicker="Just printed" title="New cards" hint="Latest paper printings, matched to our catalog." />
        <CardGrid cards={data.newCards} />
      </section>

      <section>
        <SectionTitle
          kicker="In demand"
          title="Most popular"
          hint="What collectors add most — falling back to high-value staples."
        />
        <CardGrid cards={data.popular} />
      </section>
    </div>
  );
}

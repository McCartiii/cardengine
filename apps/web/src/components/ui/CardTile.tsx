"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { CardImage } from "./CardImage";
import { Badge } from "./Badge";

export type CardTileRarity = "mythic" | "rare" | "uncommon" | "common" | string;

export interface CardTileProps {
  variantId: string;
  name: string;
  imageUri?: string | null;
  setId?: string | null;
  collectorNumber?: string | null;
  rarity?: CardTileRarity | null;
  priceUsd?: number | null;
  quantity?: number;
  foil?: boolean;
  priceDeltaPct?: number | null;
  className?: string;
  style?: CSSProperties;
}

function rarityKeyline(rarity?: string | null): string {
  const r = rarity?.toLowerCase() ?? "";
  if (r === "mythic") return "var(--rarity-mythic)";
  if (r === "rare") return "var(--rarity-rare)";
  if (r === "uncommon") return "var(--rarity-uncommon)";
  return "var(--rarity-common)";
}

function rarityBadgeVariant(
  rarity?: string | null
): "mythic" | "rare" | "uncommon" | "common" | "default" {
  const r = rarity?.toLowerCase() ?? "";
  if (r === "mythic" || r === "rare" || r === "uncommon" || r === "common") return r;
  return "default";
}

export function CardTile({
  variantId,
  name,
  imageUri,
  setId,
  collectorNumber,
  rarity,
  priceUsd,
  quantity,
  foil = false,
  priceDeltaPct,
  className = "",
  style,
}: CardTileProps) {
  const keyline = rarityKeyline(rarity);
  const href = `/card/${encodeURIComponent(variantId)}`;

  return (
    <Link
      href={href}
      className={`group flex flex-col overflow-hidden rounded-[var(--radius-lg)] bg-surface border border-border card-hover ${className}`}
      style={{
        boxShadow: "var(--shadow-card)",
        borderTopWidth: 2,
        borderTopColor: keyline,
        ...style,
      }}
    >
      <div className="relative aspect-[5/7] w-full overflow-hidden bg-surface-sunken">
        {imageUri ? (
          <CardImage
            src={imageUri}
            alt={name}
            foil={foil}
            wrapperClassName="absolute inset-0 w-full h-full"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs">
            No art
          </div>
        )}

        {foil && (
          <span
            className="absolute left-2 top-2 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            style={{
              background: "rgba(16,43,58,0.9)",
              color: "var(--accent-text)",
              border: "1px solid rgba(78,147,200,0.4)",
            }}
          >
            Foil
          </span>
        )}

        {quantity != null && quantity > 0 && (
          <span
            className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold font-stat text-text-primary"
            style={{
              background: "rgba(5,5,8,0.85)",
              border: "1px solid var(--border)",
            }}
          >
            ×{quantity}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary">
          {name}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {(setId || collectorNumber) && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted font-stat">
              {[setId?.toUpperCase(), collectorNumber ? `#${collectorNumber}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {rarity && (
            <Badge variant={rarityBadgeVariant(rarity)} setCode={setId ?? undefined}>
              {rarity}
            </Badge>
          )}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <span className="font-stat text-sm font-semibold text-text-primary">
            {priceUsd != null && priceUsd > 0 ? `$${priceUsd.toFixed(2)}` : "—"}
          </span>
          {priceDeltaPct != null && Number.isFinite(priceDeltaPct) && (
            <span
              className={`font-stat text-[11px] font-medium ${
                priceDeltaPct > 0
                  ? "text-[var(--success-text)]"
                  : priceDeltaPct < 0
                    ? "text-[var(--danger-text)]"
                    : "text-text-muted"
              }`}
            >
              {priceDeltaPct > 0 ? "+" : ""}
              {priceDeltaPct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

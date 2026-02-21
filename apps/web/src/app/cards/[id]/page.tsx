"use client";

import { useEffect, useState, use } from "react";
import { api } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";

interface StorePricing {
  store: string;
  prices: Array<{ label: string; amount: number; currency: string }>;
  buyUrl: string | null;
}

interface CardFull {
  variantId: string;
  name: string;
  setId: string | null;
  collectorNumber: string | null;
  imageUri: string | null;
  manaCost: string | null;
  typeLine: string | null;
  oracleText: string | null;
  colors: string[] | null;
  colorIdentity: string[] | null;
  cmc: number | null;
  rarity: string | null;
  storePricing: StorePricing[];
}

const RARITY_COLOR: Record<string, string> = {
  common: "#9CA3AF", uncommon: "#C0C0C0", rare: "#F59E0B", mythic: "#EF4444", special: "#A855F7",
};

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [card, setCard] = useState<CardFull | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.card(decodeURIComponent(id))
      .then(({ card: c }) => setCard(c as unknown as CardFull))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-muted animate-pulse">Loading card…</div>;
  if (!card) return <div className="p-8 text-red-400">Card not found.</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href="/" className="text-muted text-sm hover:text-white mb-6 inline-block">← Back to Browse</Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
        {/* Image */}
        <div>
          {card.imageUri ? (
            <Image
              src={card.imageUri}
              alt={card.name}
              width={488}
              height={680}
              className="rounded-2xl w-full"
              unoptimized
            />
          ) : (
            <div className="aspect-[488/680] bg-surface rounded-2xl border border-border flex items-center justify-center text-muted">
              No image
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-3xl font-black">{card.name}</h1>
            {card.typeLine && <p className="text-muted mt-1">{card.typeLine}</p>}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {card.manaCost && (
              <span className="px-3 py-1 bg-surface border border-border rounded-lg text-sm font-mono">{card.manaCost}</span>
            )}
            {card.cmc != null && (
              <span className="px-3 py-1 bg-surface border border-border rounded-lg text-sm">CMC {card.cmc}</span>
            )}
            {card.rarity && (
              <span
                className="px-3 py-1 rounded-lg text-sm font-semibold border"
                style={{ color: RARITY_COLOR[card.rarity], borderColor: RARITY_COLOR[card.rarity] + "55", backgroundColor: RARITY_COLOR[card.rarity] + "22" }}
              >
                {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
              </span>
            )}
            {card.setId && (
              <span className="px-3 py-1 bg-surface border border-border rounded-lg text-sm">{card.setId.toUpperCase()} #{card.collectorNumber}</span>
            )}
          </div>

          {/* Oracle text */}
          {card.oracleText && (
            <div className="bg-surface border border-border rounded-xl p-4 text-sm leading-relaxed whitespace-pre-line">
              {card.oracleText}
            </div>
          )}

          {/* Prices */}
          <div>
            <h2 className="font-bold mb-3">Prices</h2>
            <div className="space-y-3">
              {card.storePricing?.map((store) => (
                <div key={store.store} className="bg-surface border border-border rounded-xl p-4 flex items-start justify-between">
                  <div>
                    <p className="font-semibold mb-2">{store.store}</p>
                    <div className="flex flex-wrap gap-3">
                      {store.prices.map((p) => (
                        <span key={p.label} className="text-sm">
                          <span className="text-muted">{p.label}: </span>
                          <span className="font-bold">${p.amount.toFixed(2)}</span>
                        </span>
                      ))}
                      {store.prices.length === 0 && <span className="text-muted text-sm">No data</span>}
                    </div>
                  </div>
                  {store.buyUrl && (
                    <a
                      href={store.buyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-light text-sm hover:underline shrink-0 ml-4"
                    >
                      Buy →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

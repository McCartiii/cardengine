"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { clsx } from "clsx";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const SECTION_ORDER = ["commander", "mainboard", "sideboard", "companion"];
const SECTION_LABEL: Record<string, string> = {
  commander: "Commander", mainboard: "Mainboard", sideboard: "Sideboard", companion: "Companion",
};
const RARITY_COLOR: Record<string, string> = {
  common: "#9CA3AF", uncommon: "#CBD5E1", rare: "#F59E0B", mythic: "#EF4444",
};
const FORMAT_COLOR: Record<string, string> = {
  commander: "bg-purple-900/50 text-purple-300 border-purple-700",
  standard: "bg-green-900/50 text-green-300 border-green-700",
  modern: "bg-blue-900/50 text-blue-300 border-blue-700",
  pioneer: "bg-orange-900/50 text-orange-300 border-orange-700",
  legacy: "bg-red-900/50 text-red-300 border-red-700",
  vintage: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  pauper: "bg-gray-800/50 text-gray-400 border-gray-600",
};

interface DeckCard {
  id: string;
  cardName: string;
  variantId: string | null;
  quantity: number;
  section: string;
  imageUri: string | null;
  typeLine: string | null;
  price: number | null;
}

interface PublicDeck {
  id: string;
  name: string;
  format: string;
  commander: string | null;
  description: string | null;
  authorName: string;
  updatedAt: string;
  cards: DeckCard[];
}

export default function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [deck, setDeck] = useState<PublicDeck | null>(null);
  const [totalValue, setTotalValue] = useState(0);
  const [cardCount, setCardCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/v1/decks/${id}/public`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        return res.json();
      })
      .then((data) => {
        setDeck(data.deck);
        setTotalValue(data.totalValue);
        setCardCount(data.cardCount);
      })
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-muted animate-pulse">Loading deck…</p>
      </div>
    );
  }

  if (error || !deck) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4 text-center p-8">
        <p className="text-5xl">🔒</p>
        <h1 className="text-2xl font-bold">{error === "This deck is private" ? "Private Deck" : "Not Found"}</h1>
        <p className="text-muted">{error ?? "This deck doesn't exist."}</p>
        <Link href="/" className="text-accent-light hover:underline text-sm">← Browse CardEngine</Link>
      </div>
    );
  }

  const sections = SECTION_ORDER
    .map((s) => ({ key: s, label: SECTION_LABEL[s], cards: deck.cards.filter((c) => c.section === s) }))
    .filter((s) => s.cards.length > 0);

  const commanders = deck.cards.filter((c) => c.section === "commander");

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav bar */}
      <div className="border-b border-border bg-surface sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-black text-xl">
            Card<span className="text-accent-light">Engine</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 text-sm text-muted border border-border rounded-lg px-3 py-1.5 hover:border-accent/60 hover:text-white transition-colors"
            >
              {copied ? "✓ Copied!" : "Share Link"}
            </button>
            <Link
              href={`/decks/${id}`}
              className="text-sm text-accent-light hover:underline"
            >
              Open in App →
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Commander art banner */}
        {commanders[0]?.imageUri && (
          <div className="relative h-48 rounded-2xl overflow-hidden mb-6 bg-surface">
            <Image
              src={commanders[0].imageUri}
              alt={commanders[0].cardName}
              fill
              className="object-cover object-[center_20%] blur-sm scale-110 opacity-40"
              unoptimized
            />
            <div className="absolute inset-0 flex items-end p-6">
              <div className="flex items-end gap-4">
                <Image
                  src={commanders[0].imageUri}
                  alt={commanders[0].cardName}
                  width={80}
                  height={112}
                  className="rounded-lg shadow-xl border border-white/10"
                  unoptimized
                />
                <div>
                  <span className={clsx("text-xs px-2 py-1 rounded-md border font-bold", FORMAT_COLOR[deck.format] ?? "bg-surface text-muted border-border")}>
                    {deck.format}
                  </span>
                  <h1 className="text-2xl font-black mt-1 text-shadow">{deck.name}</h1>
                  {deck.commander && <p className="text-accent-light text-sm">{deck.commander}</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* If no commander art, plain header */}
        {commanders.length === 0 && (
          <div className="mb-6">
            <span className={clsx("text-xs px-2 py-1 rounded-md border font-bold", FORMAT_COLOR[deck.format] ?? "bg-surface text-muted border-border")}>
              {deck.format}
            </span>
            <h1 className="text-3xl font-black mt-2">{deck.name}</h1>
          </div>
        )}

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-muted">
          <span>by <strong className="text-white">{deck.authorName}</strong></span>
          <span>·</span>
          <span>{cardCount} cards</span>
          <span>·</span>
          <span>${totalValue.toFixed(2)}</span>
          <span>·</span>
          <span>Updated {new Date(deck.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>

        {deck.description && (
          <p className="text-muted text-sm bg-surface border border-border rounded-xl p-4 mb-6">{deck.description}</p>
        )}

        {/* Card sections */}
        <div className="space-y-6">
          {sections.map(({ key, label, cards }) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted">{label}</h2>
                <span className="text-xs text-muted">({cards.reduce((s, c) => s + c.quantity, 0)})</span>
              </div>

              {/* Commander section: show card images */}
              {key === "commander" ? (
                <div className="flex flex-wrap gap-3">
                  {cards.map((card) => (
                    <div key={card.id} className="flex flex-col items-center gap-1">
                      {card.imageUri ? (
                        <Image
                          src={card.imageUri}
                          alt={card.cardName}
                          width={120}
                          height={168}
                          className="rounded-lg"
                          unoptimized
                        />
                      ) : (
                        <div className="w-[120px] h-[168px] bg-surface rounded-lg border border-border flex items-center justify-center text-muted text-xs text-center p-2">
                          {card.cardName}
                        </div>
                      )}
                      <span className="text-xs text-muted">{card.cardName}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                  {cards.map((card, i) => (
                    <div key={card.id} className={clsx("flex items-center gap-3 px-4 py-2.5", i > 0 && "border-t border-border")}>
                      <span className="text-accent font-bold text-sm w-5 text-right shrink-0">{card.quantity}</span>
                      <span className="flex-1 font-medium text-sm">{card.cardName}</span>
                      {card.typeLine && <span className="text-muted text-xs hidden md:block">{card.typeLine}</span>}
                      <span className="text-muted text-sm shrink-0">{card.price != null ? `$${card.price.toFixed(2)}` : "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-12 text-center border-t border-border pt-8">
          <p className="text-muted text-sm mb-4">Build and track your own decklists on CardEngine</p>
          <Link href="/" className="px-6 py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent/80 transition-colors">
            Get Started →
          </Link>
        </div>
      </div>
    </div>
  );
}

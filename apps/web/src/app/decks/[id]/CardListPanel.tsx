"use client";

import { useState, useMemo } from "react";
import { RichCard, GroupBy, ViewMode, SortBy, groupCards, sortCards, cardImageUrl } from "./deck-helpers";

interface CardListPanelProps {
  cards: RichCard[];
  onOpenImport: () => void;
  onTogglePublic: () => void;
  deckName: string;
  isPublic: boolean;
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted pr-1">{label}</span>
      <div
        className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border"
        style={{ background: "#0F1117" }}
      >
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all"
            style={{
              background: value === opt.value ? "#1E2535" : "transparent",
              color: value === opt.value ? "#CBD5E1" : "#475569",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CardRow({ card }: { card: RichCard }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 border-t border-border first:border-t-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className="text-sm font-bold w-8 text-right shrink-0"
        style={{ color: hovered ? "transparent" : "#0D9488", userSelect: "none" }}
      >
        {card.quantity}
      </span>
      <span className="flex-1 text-sm font-medium text-white">{card.cardName}</span>
      {card.variant?.typeLine && (
        <span className="text-[11px] text-text-muted hidden sm:block">
          {card.variant.typeLine.split("—")[0].trim()}
        </span>
      )}
      {card.variant?.cmc != null && (
        <span className="text-[11px] text-text-muted w-4 text-center">{card.variant.cmc}</span>
      )}
      <span className="text-sm text-text-muted shrink-0 w-14 text-right">
        {card.price != null ? `$${card.price.toFixed(2)}` : "—"}
      </span>
    </div>
  );
}

function ArtGrid({ cards, showName }: { cards: RichCard[]; showName: boolean }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
      {cards.map(card => (
        <div key={card.id} className="group relative cursor-pointer" style={{ aspectRatio: "0.716" }}>
          <img
            src={cardImageUrl(card)}
            alt={card.cardName}
            loading="lazy"
            className="w-full h-full object-cover rounded-lg transition-transform duration-150 group-hover:scale-105 group-hover:z-10 group-hover:relative"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.6)" }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          {card.quantity > 1 && (
            <span
              className="absolute top-1 right-1 font-black px-1.5 py-0.5 rounded-md"
              style={{ background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: "10px" }}
            >
              ×{card.quantity}
            </span>
          )}
          {showName && (
            <div
              className="absolute bottom-0 inset-x-0 rounded-b-lg px-1.5 py-1 text-center"
              style={{
                background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
                fontSize: "9px",
                color: "#fff",
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {card.cardName}
            </div>
          )}
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20"
            style={{ background: "rgba(0,0,0,0.9)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {card.cardName}{card.price != null ? ` · $${card.price.toFixed(2)}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardListPanel({
  cards,
  onOpenImport,
  onTogglePublic,
  isPublic,
}: CardListPanelProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("type");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortBy, setSortBy] = useState<SortBy>("name");

  const groups = useMemo(() => {
    const g = groupCards(cards, groupBy);
    return g.map(group => ({ ...group, cards: sortCards(group.cards, sortBy) }));
  }, [cards, groupBy, sortBy]);

  const handleCopyList = () => {
    const lines = cards.map(c => `${c.quantity} ${c.cardName}`).join("\n");
    navigator.clipboard.writeText(lines);
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Sticky action bar */}
      <div
        className="sticky z-40 border-b border-border flex items-center gap-2 px-6 flex-wrap"
        style={{
          top: 97,
          background: "rgba(22,27,39,0.98)",
          backdropFilter: "blur(12px)",
          paddingTop: 10,
          paddingBottom: 10,
        }}
      >
        <SegmentedControl
          label="Group"
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: "section", label: "Section" },
            { value: "type",    label: "Type" },
            { value: "color",   label: "Color" },
            { value: "cmc",     label: "CMC" },
          ]}
        />
        <div className="w-px h-5 bg-border mx-1 shrink-0" />
        <SegmentedControl
          label="View"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: "list",    label: "List" },
            { value: "art",     label: "Art" },
            { value: "artname", label: "Art+" },
          ]}
        />
        <div className="w-px h-5 bg-border mx-1 shrink-0" />
        <SegmentedControl
          label="Sort"
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: "name",       label: "Name" },
            { value: "price-desc", label: "$↓" },
            { value: "price-asc",  label: "$↑" },
            { value: "cmc",        label: "CMC" },
          ]}
        />

        <div className="ml-auto flex gap-2 items-center">
          <button
            onClick={handleCopyList}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-text-muted hover:text-white transition-colors"
          >
            Copy List
          </button>
          <button
            onClick={onTogglePublic}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-text-muted hover:text-white transition-colors"
          >
            {isPublic ? "🔗 Public" : "🔒 Private"}
          </button>
          <button
            onClick={onOpenImport}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
            style={{ background: "#0D9488" }}
          >
            Import
          </button>
        </div>
      </div>

      {/* Card list */}
      <div className="pt-5 space-y-6">
        {cards.length === 0 ? (
          <div className="py-20 text-center rounded-2xl border border-dashed border-border">
            <p className="text-4xl mb-3">🃏</p>
            <p className="font-bold text-white mb-1">No cards yet</p>
            <p className="text-sm text-text-muted">
              Click <strong className="text-accent">Import</strong> to paste a decklist
            </p>
          </div>
        ) : (
          groups.map(({ key, label, color, cards: groupedCards, count }) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
                  {label}
                </span>
                <span className="text-[10px] text-text-muted">({count})</span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
              </div>

              {viewMode === "list" ? (
                <div className="rounded-2xl border border-border overflow-hidden" style={{ background: "#161B27" }}>
                  {groupedCards.map(card => (
                    <CardRow key={card.id} card={card} />
                  ))}
                </div>
              ) : (
                <ArtGrid cards={groupedCards} showName={viewMode === "artname"} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

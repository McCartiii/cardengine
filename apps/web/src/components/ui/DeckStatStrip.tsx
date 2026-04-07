// apps/web/src/components/ui/DeckStatStrip.tsx

interface DeckStatStripProps {
  cardCount: number;
  avgCmc: number | null;
  rareCount: number;
  mythicCount: number;
  className?: string;
}

export function DeckStatStrip({
  cardCount,
  avgCmc,
  rareCount,
  mythicCount,
  className = "",
}: DeckStatStripProps) {
  return (
    <div
      role="group"
      aria-label="Deck statistics"
      className={`flex divide-x divide-border overflow-hidden rounded-lg border border-border bg-surface-sunken ${className}`}
    >
      <StatCell value={Number.isFinite(cardCount) ? cardCount.toString() : "—"} label="Cards" />
      <StatCell
        value={avgCmc != null && Number.isFinite(avgCmc) ? avgCmc.toFixed(1) : "—"}
        label="Avg CMC"
      />
      <StatCell value={Number.isFinite(rareCount) ? rareCount.toString() : "—"} label="Rares" />
      <StatCell
        value={Number.isFinite(mythicCount) ? mythicCount.toString() : "—"}
        label="Mythics"
        valueClassName="text-[var(--rarity-mythic)]"
      />
    </div>
  );
}

function StatCell({
  value,
  label,
  valueClassName = "",
}: {
  value: string;
  label: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center px-3 py-2">
      <span
        className={`font-stat text-base font-semibold text-text-primary leading-none ${valueClassName}`}
      >
        {value}
      </span>
      <span className="mt-1 text-[9px] font-bold uppercase tracking-widest text-text-muted">
        {label}
      </span>
    </div>
  );
}

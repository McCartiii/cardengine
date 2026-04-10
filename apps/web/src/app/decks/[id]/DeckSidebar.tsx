"use client";

import { DeckStats } from "./deck-helpers";

export function DeckSidebar({ stats }: { stats: DeckStats }) {
  const maxCurve = Math.max(...stats.manaCurve.map(b => b.count), 1);
  const totalColored = stats.colorCounts.reduce((n, c) => n + c.count, 0);
  const maxType = Math.max(...stats.typeCounts.map(t => t.count), 1);

  return (
    <aside
      className="w-72 shrink-0 space-y-4"
      style={{
        position: "sticky",
        top: 108,
        alignSelf: "flex-start",
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
      }}
    >
      {/* Deck Stats */}
      <section className="rounded-2xl border border-border p-4" style={{ background: "#161B27" }}>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3">Deck Stats</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Cards",  value: stats.totalCards },
            { label: "Unique Cards", value: stats.uniqueCards },
            { label: "Total Value",  value: `$${stats.totalValue.toFixed(2)}` },
            { label: "Avg CMC",      value: stats.avgCmc.toFixed(2) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-sm font-bold text-white">{value}</p>
              <p className="text-[10px] text-text-muted uppercase tracking-wide mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mana Curve */}
      <section className="rounded-2xl border border-border p-4" style={{ background: "#161B27" }}>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3">Mana Curve</h3>
        <div className="space-y-1.5">
          {stats.manaCurve.filter(b => b.count > 0).map(({ cmc, count }) => (
            <div key={cmc} className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-4 text-right shrink-0">{cmc}</span>
              <div className="flex-1 h-4 rounded-sm overflow-hidden" style={{ background: "#0F1117" }}>
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${(count / maxCurve) * 100}%`,
                    background: "linear-gradient(to right, #0D9488, #14B8A6)",
                    minWidth: count > 0 ? 4 : 0,
                  }}
                />
              </div>
              <span className="text-[10px] text-text-muted w-4 shrink-0">{count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Color Distribution */}
      {stats.colorCounts.length > 0 && (
        <section className="rounded-2xl border border-border p-4" style={{ background: "#161B27" }}>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3">Color Distribution</h3>
          <div className="flex h-3 rounded-full overflow-hidden gap-px mb-3">
            {stats.colorCounts.map(({ color, hex, count }) => (
              <div
                key={color}
                title={`${color}: ${count}`}
                style={{ width: `${(count / totalColored) * 100}%`, background: hex, minWidth: 2 }}
              />
            ))}
          </div>
          <div className="space-y-1">
            {stats.colorCounts.map(({ color, label, hex, count }) => (
              <div key={color} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: hex }} />
                <span className="text-xs text-text-muted flex-1">{label}</span>
                <span className="text-xs font-semibold text-white">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Card Types */}
      {stats.typeCounts.length > 0 && (
        <section className="rounded-2xl border border-border p-4" style={{ background: "#161B27" }}>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3">Card Types</h3>
          <div className="space-y-2">
            {stats.typeCounts.map(({ type, color, count }) => (
              <div key={type} className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted w-20 shrink-0">{type}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "#0F1117" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(count / maxType) * 100}%`, background: color, minWidth: count > 0 ? 4 : 0 }}
                  />
                </div>
                <span className="text-[10px] text-text-muted w-4 text-right shrink-0">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Rarity */}
      {stats.rarityCounts.length > 0 && (
        <section className="rounded-2xl border border-border p-4" style={{ background: "#161B27" }}>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3">Rarity</h3>
          <div className="space-y-1.5">
            {stats.rarityCounts.map(({ rarity, color, count }) => (
              <div key={rarity} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs text-text-muted capitalize flex-1">{rarity}</span>
                <span className="text-xs font-semibold text-white">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}

"use client";

export interface ToolState {
  tool: string;
  status: "pending" | "running" | "done";
}

const TOOL_LABELS: Record<string, string> = {
  fetch_edhrec: "EDHREC",
  search_web: "Web Search",
  get_meta_snapshot: "Meta Snapshot",
  get_card_details: "Card Details",
  get_collection: "Your Collection",
  lint_commander_deck: "Bracket lint",
  validate_deck: "Deck validation",
};

interface StatusPillsProps {
  tools: ToolState[];
  statusMessage: string | null;
}

export function StatusPills({ tools, statusMessage }: StatusPillsProps) {
  if (tools.length === 0 && !statusMessage) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60 px-3 py-3 mb-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/40 to-transparent" />
      <div className="mb-2 text-[10px] tracking-[0.14em] uppercase text-slate-500 font-semibold">
        Agent Activity
      </div>
      <div className="flex flex-wrap gap-2">
      {tools.map((t) => (
        <span
          key={t.tool}
          className={[
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 shadow-sm",
            t.status === "running"
              ? "bg-gradient-to-r from-teal-500/20 to-cyan-500/20 text-teal-200 border border-teal-400/40"
              : t.status === "done"
              ? "bg-slate-800/70 text-slate-300 border border-slate-600/50"
              : "bg-slate-800 text-slate-500 border border-slate-700",
          ].join(" ")}
        >
          {t.status === "running" && (
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
          )}
          {t.status === "done" && (
            <span className="text-teal-400">✓</span>
          )}
          {TOOL_LABELS[t.tool] ?? t.tool}
        </span>
      ))}
      </div>
      {statusMessage && (
        <div className="mt-2 text-xs text-slate-300 italic">
          {statusMessage}
        </div>
      )}
    </div>
  );
}

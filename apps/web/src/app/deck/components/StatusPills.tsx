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
};

interface StatusPillsProps {
  tools: ToolState[];
  statusMessage: string | null;
}

export function StatusPills({ tools, statusMessage }: StatusPillsProps) {
  if (tools.length === 0 && !statusMessage) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {tools.map((t) => (
        <span
          key={t.tool}
          className={[
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-300",
            t.status === "running"
              ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
              : t.status === "done"
              ? "bg-slate-700/60 text-slate-400 border border-slate-600/40"
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
      {statusMessage && (
        <span className="text-xs text-slate-400 self-center ml-1 italic">
          {statusMessage}
        </span>
      )}
    </div>
  );
}

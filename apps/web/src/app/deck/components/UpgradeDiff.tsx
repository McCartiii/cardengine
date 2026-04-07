"use client";

import { useState } from "react";
import type { ParsedSwap } from "@/lib/deckAgentStream";

interface UpgradeDiffProps {
  swaps: ParsedSwap[];
  onAccept: (swap: ParsedSwap) => void;
  onReject: (swap: ParsedSwap) => void;
}

export function UpgradeDiff({ swaps, onAccept, onReject }: UpgradeDiffProps) {
  const [decisions, setDecisions] = useState<Map<string, "accepted" | "rejected">>(new Map());

  function decide(swap: ParsedSwap, decision: "accepted" | "rejected") {
    setDecisions((prev) => new Map(prev).set(swap.cut.name, decision));
    if (decision === "accepted") onAccept(swap);
    else onReject(swap);
  }

  if (swaps.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-slate-200 mb-1">
        Suggested Upgrades — {swaps.length} swaps
      </h3>
      {swaps.map((swap) => {
        const decision = decisions.get(swap.cut.name);
        return (
          <div
            key={swap.cut.name}
            className={[
              "grid grid-cols-[1fr_auto_1fr] gap-2 p-3 rounded-xl border transition-all duration-200",
              decision === "accepted"
                ? "border-teal-500/50 bg-teal-500/5 opacity-60"
                : decision === "rejected"
                ? "border-slate-600/30 bg-slate-800/30 opacity-40"
                : "border-slate-600/50 bg-slate-800/50",
            ].join(" ")}
          >
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-xs font-semibold text-red-400 mb-0.5">CUT</div>
              <div className="text-sm text-slate-200 font-medium">{swap.cut.name}</div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{swap.cut.reason}</p>
            </div>

            <div className="flex flex-col items-center justify-center gap-2 px-1">
              <div className={`text-xs font-bold ${swap.netSynergy >= 0 ? "text-teal-400" : "text-red-400"}`}>
                {swap.netSynergy >= 0 ? "+" : ""}{(swap.netSynergy * 100).toFixed(0)}%
              </div>
              <span className="text-slate-600 text-lg">→</span>
              {!decision && (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => decide(swap, "accepted")}
                    className="text-xs px-2 py-1 rounded bg-teal-600/30 text-teal-300 hover:bg-teal-600/50 border border-teal-600/40 transition-colors"
                  >✓</button>
                  <button
                    onClick={() => decide(swap, "rejected")}
                    className="text-xs px-2 py-1 rounded bg-slate-700/40 text-slate-400 hover:bg-slate-700/60 border border-slate-600/40 transition-colors"
                  >✕</button>
                </div>
              )}
              {decision === "accepted" && <span className="text-teal-400 text-xs">✓</span>}
              {decision === "rejected" && <span className="text-slate-500 text-xs">✕</span>}
            </div>

            <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
              <div className="text-xs font-semibold text-teal-400 mb-0.5">ADD</div>
              <div className="text-sm text-slate-200 font-medium">{swap.add.name}</div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{swap.add.reason}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

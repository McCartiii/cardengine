"use client";

import type { DeckValidationResult } from "@/lib/deckAgentStream";

interface ValidationPanelProps {
  result: DeckValidationResult;
}

export function ValidationPanel({ result }: ValidationPanelProps) {
  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warn");

  return (
    <div
      className={[
        "rounded-xl border p-3 text-sm",
        result.valid
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-red-500/40 bg-red-500/10",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={result.valid ? "text-emerald-300 font-semibold" : "text-red-300 font-semibold"}>
          {result.valid ? "Deck validated" : "Validation failed"}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          {result.metrics.deckSizeIncludingCommander || result.metrics.mainCount} cards
          {result.metrics.estimatedPriceUsd != null && ` · ~$${result.metrics.estimatedPriceUsd.toFixed(0)}`}
        </span>
      </div>

      {!result.valid && result.repairHints.length > 0 && (
        <ul className="mb-2 space-y-1 text-xs text-red-200/90 list-disc list-inside">
          {result.repairHints.slice(0, 6).map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {errors.slice(0, 5).map((issue) => (
            <div key={`${issue.code}-${issue.message}`} className="text-xs text-red-200/90">
              {issue.message}
              {issue.cards?.length ? (
                <span className="block text-red-300/70 mt-0.5 truncate">
                  {issue.cards.join(", ")}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-1 border-t border-slate-600/30 pt-2 mt-2">
          {warnings.slice(0, 3).map((issue) => (
            <div key={`warn-${issue.code}-${issue.message}`} className="text-xs text-amber-200/80">
              {issue.message}
            </div>
          ))}
        </div>
      )}

      {result.valid && warnings.length === 0 && (
        <p className="text-xs text-emerald-200/80">
          Size, legality, budget, and blueprint checks passed.
        </p>
      )}
    </div>
  );
}

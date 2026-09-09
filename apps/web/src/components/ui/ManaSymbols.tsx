"use client";

import { useState } from "react";

interface ManaSymbolProps {
  symbol: string;
  size?: "sm" | "md";
}

export function manaSymbolCode(symbol: string): string {
  const token = symbol.replace(/^\{|\}$/g, "").replace(/\//g, "").toUpperCase();
  if (token === "∞") return "INFINITY";
  if (token === "½") return "HALF";
  return token;
}

export function ManaSymbol({ symbol, size = "sm" }: ManaSymbolProps) {
  const [failed, setFailed] = useState(false);
  const code = manaSymbolCode(symbol);
  const dimensions = size === "md" ? "h-6 w-6" : "h-[18px] w-[18px]";

  if (failed) {
    return (
      <span
        className={`inline-flex ${dimensions} items-center justify-center rounded-full border border-border bg-surface-raised text-[9px] font-bold not-italic text-text-primary`}
        title={symbol}
      >
        {code}
      </span>
    );
  }

  return (
    // Scryfall publishes the canonical Magic symbol artwork at stable URLs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(code)}.svg`}
      alt={symbol}
      title={symbol}
      className={`inline-block ${dimensions} align-[-0.22em] drop-shadow-sm`}
      loading="eager"
      onError={() => setFailed(true)}
    />
  );
}

export function ManaCost({ cost }: { cost: string }) {
  const symbols = cost.match(/\{[^}]+\}/g) ?? [];
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Mana cost ${cost}`}>
      {symbols.map((symbol, index) => (
        <ManaSymbol key={`${symbol}-${index}`} symbol={symbol} size="md" />
      ))}
    </span>
  );
}

export function ManaText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\{[^}]+\})/g).map((part, index) =>
        /^\{[^}]+\}$/.test(part) ? (
          <ManaSymbol key={`${part}-${index}`} symbol={part} />
        ) : (
          part
        )
      )}
    </>
  );
}

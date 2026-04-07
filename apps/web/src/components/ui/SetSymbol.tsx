// apps/web/src/components/ui/SetSymbol.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { getRarityColor } from "@/lib/identity";

interface SetSymbolProps {
  setCode: string;
  rarity: string | null | undefined;
  size?: number;
  className?: string;
}

// Module-level cache — persists for the page session
const svgCache = new Map<string, string>();

function sanitizeSvg(svgText: string): string {
  return svgText
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\s+on\w+="[^"]*"/gi, "")
    .replace(/javascript:/gi, "blocked:");
}

function injectRarityColor(svgText: string, color: string): string {
  // Remove width/height attributes so the SVG scales via CSS
  let result = svgText
    .replace(/\s+width="[^"]*"/g, "")
    .replace(/\s+height="[^"]*"/g, "");

  // Inject fill color — preserve fill="none" for stroke-only paths
  result = result
    .replace(/fill="(?!none\b)([^"]*)"/g, `fill="${color}"`)
    .replace(/fill:(?!\s*none)\s*[^;"}]*/g, `fill:${color}`)
    .replace(/stroke="(?!none\b)([^"]*)"/g, `stroke="${color}"`)
    .replace(/stroke:(?!\s*none)\s*[^;"}]*/g, `stroke:${color}`);

  return result;
}

export function SetSymbol({ setCode, rarity, size = 14, className = "" }: SetSymbolProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const color = getRarityColor(rarity);
  const isMythic = rarity?.toLowerCase() === "mythic";

  useEffect(() => {
    const code = setCode.toLowerCase();
    if (!/^[a-z0-9_-]{1,12}$/.test(code)) return;
    const cacheKey = `${code}:${color}`;

    let mounted = true;

    if (svgCache.has(cacheKey)) {
      const cached = svgCache.get(cacheKey)!;
      // Defer to avoid calling setState synchronously inside useEffect
      Promise.resolve().then(() => { if (mounted) setSvgContent(cached); });
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    fetch(`https://svgs.scryfall.io/sets/${code}.svg`, {
      signal: abortRef.current.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.text();
      })
      .then((text) => {
        const colored = injectRarityColor(text, color);
        const safe = sanitizeSvg(colored);
        svgCache.set(cacheKey, safe);
        if (mounted) setSvgContent(safe);
      })
      .catch(() => {});

    return () => {
      mounted = false;
      abortRef.current?.abort();
    };
  }, [setCode, color]);

  if (!svgContent) {
    // Fallback: colored circle while loading or on error
    return (
      <span
        className={className}
        style={{
          display: "inline-flex",
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          opacity: 0.6,
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 ${isMythic ? "animate-mythic-pulse" : ""} ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}

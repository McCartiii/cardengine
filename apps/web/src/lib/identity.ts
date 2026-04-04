// apps/web/src/lib/identity.ts
import type { CSSProperties } from "react";

export type ManaColor = "W" | "U" | "B" | "R" | "G";

interface IdentityStyle {
  background: string;
  borderColor: string;
  "--hover-glow": string;
}

const IDENTITY_STYLES: Record<ManaColor | "multi" | "none", IdentityStyle> = {
  W: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-W-tint))",
    borderColor: "var(--id-W-border)",
    "--hover-glow": "var(--id-W-glow)",
  },
  U: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-U-tint))",
    borderColor: "var(--id-U-border)",
    "--hover-glow": "var(--id-U-glow)",
  },
  B: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-B-tint))",
    borderColor: "var(--id-B-border)",
    "--hover-glow": "var(--id-B-glow)",
  },
  R: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-R-tint))",
    borderColor: "var(--id-R-border)",
    "--hover-glow": "var(--id-R-glow)",
  },
  G: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-G-tint))",
    borderColor: "var(--id-G-border)",
    "--hover-glow": "var(--id-G-glow)",
  },
  multi: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-multi-tint))",
    borderColor: "var(--id-multi-border)",
    "--hover-glow": "var(--id-multi-glow)",
  },
  none: {
    background: "var(--surface-raised)",
    borderColor: "var(--border)",
    "--hover-glow": "rgba(0,0,0,0)",
  },
};

/**
 * Returns inline style object for a card container based on its color identity.
 * - 0 colors → neutral
 * - 1–2 colors → first color's tint
 * - 3+ colors → gold/multi tint
 */
export function getIdentityStyle(colorIdentity: string[]): CSSProperties {
  let key: ManaColor | "multi" | "none";

  if (colorIdentity.length === 0) {
    key = "none";
  } else if (colorIdentity.length >= 3) {
    key = "multi";
  } else {
    const first = colorIdentity[0].toUpperCase() as ManaColor;
    key = (["W", "U", "B", "R", "G"] as ManaColor[]).includes(first) ? first : "none";
  }

  return IDENTITY_STYLES[key] as CSSProperties;
}

/** Returns the rarity color hex used for set symbol fill. */
export function getRarityColor(rarity: string | null | undefined): string {
  switch (rarity?.toLowerCase()) {
    case "mythic":   return "#FB923C";
    case "rare":     return "#C9A84C";
    case "uncommon": return "#94A3B8";
    default:         return "#6B7280"; // common / unknown
  }
}

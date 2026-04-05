// apps/web/src/components/ui/Badge.tsx
"use client";

import React from "react";
import { SetSymbol } from "./SetSymbol";

export type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "mythic"
  | "rare"
  | "uncommon"
  | "common"
  | "mana-W" | "mana-U" | "mana-B" | "mana-R" | "mana-G"
  | "tcg" | "mkm" | "ck" | "ebay" | "mtgo";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  /** Set code for rarity variants — renders actual set symbol */
  setCode?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:   "bg-surface-sunken text-text-secondary border border-border",
  accent:    "bg-accent-light text-accent-text border border-[var(--accent)] border-opacity-30",
  success:   "bg-success-light text-[var(--success-text)] border border-[var(--success)] border-opacity-30",
  danger:    "bg-danger-light text-[var(--danger-text)] border border-[var(--danger)] border-opacity-30",
  warning:   "bg-warning-light text-[var(--warning-text)] border border-[var(--warning)] border-opacity-30",

  // Rarity — unused here; rarity path returns early using rarityConfig inline styles
  mythic:   "",
  rare:     "",
  uncommon: "",
  common:   "",

  // Mana
  "mana-W": "bg-[var(--mana-W)] text-[var(--mana-W-text)]",
  "mana-U": "bg-[var(--mana-U)] text-[var(--mana-U-text)]",
  "mana-B": "bg-[var(--mana-B)] text-[var(--mana-B-text)]",
  "mana-R": "bg-[var(--mana-R)] text-[var(--mana-R-text)]",
  "mana-G": "bg-[var(--mana-G)] text-[var(--mana-G-text)]",

  // Markets
  tcg:  "bg-[var(--market-tcg-bg)]  text-[var(--market-tcg)]",
  mkm:  "bg-[var(--market-mkm-bg)]  text-[var(--market-mkm)]",
  ck:   "bg-[var(--market-ck-bg)]   text-[var(--market-ck)]",
  ebay: "bg-[var(--market-ebay-bg)] text-[var(--market-ebay)]",
  mtgo: "bg-[var(--market-mtgo-bg)] text-[var(--market-mtgo)]",
};

const rarityConfig = {
  mythic: {
    bg: "rgba(251,146,60,0.10)",
    border: "rgba(251,146,60,0.30)",
    color: "var(--rarity-mythic)",
    shadow: "0 1px 4px rgba(251,146,60,0.20), inset 0 1px 0 rgba(255,255,255,0.12)",
    rarity: "mythic" as const,
  },
  rare: {
    bg: "rgba(201,168,76,0.10)",
    border: "rgba(201,168,76,0.30)",
    color: "var(--rarity-rare)",
    shadow: "0 1px 4px rgba(201,168,76,0.20), inset 0 1px 0 rgba(255,255,255,0.12)",
    rarity: "rare" as const,
  },
  uncommon: {
    bg: "rgba(148,163,184,0.10)",
    border: "rgba(148,163,184,0.25)",
    color: "var(--rarity-uncommon)",
    shadow: "0 1px 3px rgba(148,163,184,0.12)",
    rarity: "uncommon" as const,
  },
  common: {
    bg: "rgba(107,114,128,0.08)",
    border: "rgba(107,114,128,0.18)",
    color: "var(--rarity-common)",
    shadow: "none",
    rarity: "common" as const,
  },
};

export function Badge({ children, variant = "default", className = "", setCode }: BadgeProps) {
  const isRarity = variant === "mythic" || variant === "rare" || variant === "uncommon" || variant === "common";

  if (isRarity) {
    const cfg = rarityConfig[variant];
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] ${className}`}
        style={{
          background: cfg.bg,
          borderColor: cfg.border,
          color: cfg.color,
          boxShadow: cfg.shadow,
          borderWidth: 1,
          borderStyle: "solid",
        }}
      >
        {setCode ? (
          <SetSymbol setCode={setCode} rarity={cfg.rarity} size={10} />
        ) : null}
        {children}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold
        ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

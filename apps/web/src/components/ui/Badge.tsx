"use client";

import React from "react";

type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "mythic"
  | "rare"
  | "uncommon"
  | "common"
  | "mana-W"
  | "mana-U"
  | "mana-B"
  | "mana-R"
  | "mana-G"
  | "tcg"
  | "mkm"
  | "ck"
  | "ebay"
  | "mtgo";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-sunken text-text-secondary",
  accent: "bg-accent-light text-accent-text",
  success: "bg-success-light text-[var(--success-text)]",
  danger: "bg-danger-light text-[var(--danger-text)]",
  warning: "bg-warning-light text-[var(--warning-text)]",
  mythic: "bg-[var(--rarity-mythic-bg)] text-[var(--rarity-mythic)]",
  rare: "bg-[var(--rarity-rare-bg)] text-[var(--rarity-rare)]",
  uncommon: "bg-[var(--rarity-uncommon-bg)] text-[var(--rarity-uncommon)]",
  common: "bg-[var(--rarity-common-bg)] text-[var(--rarity-common)]",
  "mana-W": "bg-[var(--mana-W)] text-[var(--mana-W-text)]",
  "mana-U": "bg-[var(--mana-U)] text-[var(--mana-U-text)]",
  "mana-B": "bg-[var(--mana-B)] text-[var(--mana-B-text)]",
  "mana-R": "bg-[var(--mana-R)] text-[var(--mana-R-text)]",
  "mana-G": "bg-[var(--mana-G)] text-[var(--mana-G-text)]",
  tcg: "bg-[var(--market-tcg-bg)] text-[var(--market-tcg)]",
  mkm: "bg-[var(--market-mkm-bg)] text-[var(--market-mkm)]",
  ck: "bg-[var(--market-ck-bg)] text-[var(--market-ck)]",
  ebay: "bg-[var(--market-ebay-bg)] text-[var(--market-ebay)]",
  mtgo: "bg-[var(--market-mtgo-bg)] text-[var(--market-mtgo)]",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold
        ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

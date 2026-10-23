// Design tokens for the mobile app, direction "Holo": a pearl-light world where
// foil is the signature (iridescent rings, sweeping sheens), with the
// collection kept in a deep-indigo binder.
import type { TextStyle, ViewStyle } from "react-native";
import { font } from "./fonts";

export const color = {
  bg: "#F3F4FA",
  surface: "#FFFFFF",
  surface2: "#F1F2F8",
  surface3: "#E6E8F2",
  overlay: "rgba(18,20,43,0.72)",
  scrim: "rgba(18,20,43,0.45)",

  border: "#E7E8F1",
  borderStrong: "#D5D7E6",

  text: "#12142B",
  textSecondary: "#5B5F7A",
  textTertiary: "#8A8DA6",
  textInverse: "#FFFFFF",

  // Primary actions are ink; violet carries links, charts and focus.
  accent: "#7C5CFF",
  accentPressed: "#6646F0",
  accentSoft: "#EFEBFF",
  onAccent: "#FFFFFF",
  ink: "#12142B",

  positive: "#0E8A4F",
  positiveSoft: "#E3F8EE",
  negative: "#D6334A",
  negativeSoft: "#FDECEF",
  info: "#3AA6F5",
  gold: "#F5B014",
} as const;

/** Iridescent foil stops, used for rings, sheens and the Scan button. */
export const holo = ["#FF9AD5", "#FFD36E", "#8FF0C6", "#7CC8FF", "#B79BFF", "#FF9AD5"] as const;

/** Soft color blobs that drift behind light screens. */
export const blobs = ["#C9B6FF", "#9EE7FF", "#FFD1EC"] as const;

/** The binder: a deep indigo cover around light pages. */
export const binder = {
  coverTop: "#2D3768",
  cover: "#1A2045",
  coverDeep: "#12162F",
  coverText: "#FFFFFF",
  coverMuted: "#AEB8E8",
  page: "#E9ECF5",
  pageInk: "#4A5585",
  ring: "#C9CEDB",
  gold: ["#FFD58A", "#F2A93B"],
  onGold: "#2A1A00",
} as const;

/** The sky gradient behind every screen. */
export const skyGradient = ["#F3F4FA", "#F3F4FA", "#F3F4FA"] as const;

/** Frosted-glass fill and edge for pills, bars and floating buttons. */
export const glass = {
  fill: "rgba(255,255,255,0.6)",
  fillStrong: "rgba(255,255,255,0.78)",
  edge: "rgba(255,255,255,0.95)",
} as const;

export const mana: Record<string, string> = {
  W: "#F0E6C8",
  U: "#4A90D9",
  B: "#6B5F7E",
  R: "#E5533D",
  G: "#3FA45B",
  C: "#A8A29E",
};

export const rarity: Record<string, string> = {
  common: "#98A2B3",
  uncommon: "#7C93AE",
  rare: "#D9A21B",
  mythic: "#EE6A2C",
  special: "#9B5DE5",
  bonus: "#9B5DE5",
};

/** Bright gradients for icon bubbles, so the chrome feels alive. */
export const bubble = {
  blue: ["#8CE0FF", "#3AA6F5"],
  violet: ["#B9A0FF", "#7C5CFF"],
  pink: ["#FF9AC8", "#FF4D8D"],
  orange: ["#FFC27A", "#FF8A2B"],
  green: ["#8FF0C6", "#1FBF7A"],
  teal: ["#7FE6E0", "#17A9A1"],
} as const satisfies Record<string, readonly [string, string]>;
export type BubbleColor = keyof typeof bubble;

export const elevation = {
  card: {
    shadowColor: "#3C2E8C",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: "#3C2E8C",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
} satisfies Record<string, ViewStyle>;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, sheet: 32, pill: 999 } as const;

/** Real cards round their corners at ~4.7% of the width. */
export const cardRadius = (width: number) => Math.max(4, Math.round(width * 0.047));

/** Width/height of a Magic card (63 × 88 mm). */
export const CARD_ASPECT = 63 / 88;

/** Bottom padding that keeps content clear of the floating tab bar. */
export const TAB_BAR_CLEARANCE = 120;

const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

// Weights live in the family name, so no fontWeight here (Android ignores it
// for custom fonts anyway).
export const type = {
  display: { fontFamily: font.heavy, fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  title: { fontFamily: font.heavy, fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  section: { fontFamily: font.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  headline: { fontFamily: font.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22, letterSpacing: -0.2 },
  callout: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18, letterSpacing: -0.1 },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  price: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, letterSpacing: -0.3, ...tabular },
  priceLarge: { fontFamily: font.heavy, fontSize: 36, lineHeight: 42, letterSpacing: -1.2, ...tabular },
  number: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: -0.2, ...tabular },
  code: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.2, textTransform: "uppercase", ...tabular },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

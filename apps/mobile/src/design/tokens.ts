// Design tokens for the mobile app. Dark-first: card art is the hero, so the
// chrome stays near-black and neutral, with a single warm accent.
import type { TextStyle, ViewStyle } from "react-native";
import { font } from "./fonts";

export const color = {
  bg: "#09090B",
  surface: "#141418",
  surface2: "#1C1C22",
  surface3: "#26262E",
  overlay: "rgba(9,9,11,0.72)",
  scrim: "rgba(0,0,0,0.6)",

  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",

  text: "#FAFAFA",
  textSecondary: "#A1A1AA",
  textTertiary: "#71717A",
  textInverse: "#09090B",

  accent: "#FFB224",
  accentPressed: "#E89B0C",
  accentSoft: "rgba(255,178,36,0.14)",
  onAccent: "#1B1300",

  positive: "#34D399",
  positiveSoft: "rgba(52,211,153,0.14)",
  negative: "#F87171",
  negativeSoft: "rgba(248,113,113,0.14)",
  info: "#60A5FA",
} as const;

export const mana: Record<string, string> = {
  W: "#F0E6C8",
  U: "#4A90D9",
  B: "#8B7FA8",
  R: "#E5533D",
  G: "#3FA45B",
  C: "#A8A29E",
};

export const rarity: Record<string, string> = {
  common: "#A1A1AA",
  uncommon: "#B9CCDD",
  rare: "#E8C468",
  mythic: "#F2793B",
  special: "#C084FC",
  bonus: "#C084FC",
};

/** Raised surface: hairline edge plus a soft drop shadow. */
export const elevation = {
  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  floating: {
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
} satisfies Record<string, ViewStyle>;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 } as const;

/** Real cards round their corners at ~4.7% of the width. */
export const cardRadius = (width: number) => Math.max(4, Math.round(width * 0.047));

/** Width/height of a Magic card (63 × 88 mm). */
export const CARD_ASPECT = 63 / 88;

/** Bottom padding that keeps content clear of the floating tab bar. */
export const TAB_BAR_CLEARANCE = 112;

const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

// Instrument Serif carries headlines and hero numbers, Geist everything else,
// with tabular digits wherever numbers line up. Weights live in the family name, so no
// fontWeight here (Android ignores it for custom fonts anyway).
export const type = {
  display: { fontFamily: font.serif, fontSize: 44, lineHeight: 48, letterSpacing: -0.6 },
  title: { fontFamily: font.serif, fontSize: 36, lineHeight: 40, letterSpacing: -0.4 },
  section: { fontFamily: font.serif, fontSize: 26, lineHeight: 30, letterSpacing: -0.2 },
  headline: { fontFamily: font.sansSemiBold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: font.sans, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.sansMedium, fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  callout: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.sans, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: font.sansMedium, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: "uppercase" },
  price: { fontFamily: font.sansSemiBold, fontSize: 14, lineHeight: 18, letterSpacing: -0.2, ...tabular },
  priceLarge: { fontFamily: font.serif, fontSize: 52, lineHeight: 56, letterSpacing: -1, ...tabular },
  number: { fontFamily: font.sansSemiBold, fontSize: 11, lineHeight: 14, letterSpacing: 0, ...tabular },
  code: { fontFamily: font.sansMedium, fontSize: 11, lineHeight: 14, letterSpacing: 0.3, textTransform: "uppercase", ...tabular },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

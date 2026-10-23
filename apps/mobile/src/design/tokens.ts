// Design tokens for the mobile app. Dark-first: card art is the hero, so the
// chrome stays near-black and neutral, with a single warm accent.
import type { TextStyle } from "react-native";

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

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, card: 10, pill: 999 } as const;

/** Width/height of a Magic card (63 × 88 mm). */
export const CARD_ASPECT = 63 / 88;

/** Bottom padding that keeps content clear of the floating tab bar. */
export const TAB_BAR_CLEARANCE = 112;

const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.6 },
  headline: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "500" },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: "700" },
  callout: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  price: { fontSize: 15, lineHeight: 20, fontWeight: "800", ...tabular },
  priceLarge: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8, ...tabular },
  number: { fontSize: 13, lineHeight: 18, fontWeight: "700", ...tabular },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

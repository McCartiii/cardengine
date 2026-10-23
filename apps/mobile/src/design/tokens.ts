// Design tokens for the mobile app. Light and bright: a soft sky gradient
// behind white sheets, frosted-glass controls, one confident blue for action,
// and card art doing the rest.
import type { TextStyle, ViewStyle } from "react-native";
import { font } from "./fonts";

export const color = {
  bg: "#EEF2F8",
  surface: "#FFFFFF",
  surface2: "#F2F4F7",
  surface3: "#E7EBF1",
  overlay: "rgba(16,24,40,0.72)",
  scrim: "rgba(16,24,40,0.45)",

  border: "#E4E7EC",
  borderStrong: "#D0D5DD",

  text: "#0B1220",
  textSecondary: "#555E70",
  textTertiary: "#98A2B3",
  textInverse: "#FFFFFF",

  accent: "#2F6FEB",
  accentPressed: "#2459C7",
  accentSoft: "#E6EEFD",
  onAccent: "#FFFFFF",

  positive: "#12A35B",
  positiveSoft: "#E3F6EC",
  negative: "#E5484D",
  negativeSoft: "#FDECEC",
  info: "#2F6FEB",
  gold: "#F5B014",
} as const;

/** The sky gradient behind every screen. */
export const skyGradient = ["#D5E1F6", "#E6ECF8", "#EEF2F8"] as const;

/** Frosted-glass fill and edge for pills, bars and floating buttons. */
export const glass = {
  fill: "rgba(255,255,255,0.62)",
  fillStrong: "rgba(255,255,255,0.82)",
  edge: "rgba(255,255,255,0.9)",
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
  blue: ["#5B9BFF", "#2F6FEB"],
  violet: ["#B28CFF", "#7B4DFF"],
  pink: ["#FF8DB7", "#F0477E"],
  orange: ["#FFB357", "#F57C1F"],
  green: ["#5BDB9A", "#18A85F"],
  teal: ["#58D7E3", "#1597B5"],
} as const satisfies Record<string, readonly [string, string]>;
export type BubbleColor = keyof typeof bubble;

export const elevation = {
  card: {
    shadowColor: "#1D2939",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: "#1D2939",
    shadowOpacity: 0.16,
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

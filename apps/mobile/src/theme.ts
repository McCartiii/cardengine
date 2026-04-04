import { Platform } from "react-native";

export const colors = {
  light: {
    bg: "#F8F6F3",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    surfaceSunken: "#F1EEED",

    textPrimary: "#1C1917",
    textSecondary: "#78716C",
    textMuted: "#A8A29E",
    textInverse: "#FFFFFF",

    border: "#E7E5E4",
    borderStrong: "#D6D3D1",

    accent: "#CA8A04",
    accentHover: "#A16207",
    accentLight: "#FEFCE8",
    accentText: "#854D0E",

    success: "#10B981",
    successLight: "#ECFDF5",
    successText: "#065F46",

    danger: "#EF4444",
    dangerLight: "#FEF2F2",
    dangerText: "#991B1B",

    warning: "#F59E0B",
    warningLight: "#FFFBEB",
    warningText: "#92400E",

    // Mana colors
    manaW: "#F9F3E3",
    manaWText: "#92700C",
    manaU: "#DBEAFE",
    manaUText: "#1E40AF",
    manaB: "#E5E5E5",
    manaBText: "#374151",
    manaR: "#FEE2E2",
    manaRText: "#991B1B",
    manaG: "#DCFCE7",
    manaGText: "#166534",

    // Market colors
    marketTcg: "#CA8A04",
    marketTcgBg: "#FEFCE8",
    marketMkm: "#10B981",
    marketMkmBg: "#ECFDF5",
    marketCk: "#3B82F6",
    marketCkBg: "#EFF6FF",
    marketEbay: "#EF4444",
    marketEbayBg: "#FEF2F2",
    marketMtgo: "#F59E0B",
    marketMtgoBg: "#FFFBEB",

    // Rarity
    rarityMythic: "#EA580C",
    rarityMythicBg: "#FFF7ED",
    rarityRare: "#CA8A04",
    rarityRareBg: "#FEFCE8",
    rarityUncommon: "#6B7280",
    rarityUncommonBg: "#F3F4F6",
    rarityCommon: "#9CA3AF",
    rarityCommonBg: "#F9FAFB",
  },
  dark: {
    bg: "#1C1917",
    surface: "#292524",
    surfaceRaised: "#33302E",
    surfaceSunken: "#1A1816",

    textPrimary: "#F5F5F4",
    textSecondary: "#A8A29E",
    textMuted: "#78716C",
    textInverse: "#1C1917",

    border: "#44403C",
    borderStrong: "#57534E",

    accent: "#FBBF24",
    accentHover: "#F59E0B",
    accentLight: "#451A03",
    accentText: "#FDE68A",

    success: "#34D399",
    successLight: "#064E3B",
    successText: "#6EE7B7",

    danger: "#F87171",
    dangerLight: "#450A0A",
    dangerText: "#FCA5A5",

    warning: "#FBBF24",
    warningLight: "#451A03",
    warningText: "#FDE68A",

    manaW: "#422006",
    manaWText: "#FDE68A",
    manaU: "#1E3A5F",
    manaUText: "#93C5FD",
    manaB: "#374151",
    manaBText: "#D1D5DB",
    manaR: "#450A0A",
    manaRText: "#FCA5A5",
    manaG: "#052E16",
    manaGText: "#86EFAC",

    marketTcg: "#FBBF24",
    marketTcgBg: "#451A03",
    marketMkm: "#34D399",
    marketMkmBg: "#064E3B",
    marketCk: "#60A5FA",
    marketCkBg: "#1E3A5F",
    marketEbay: "#F87171",
    marketEbayBg: "#450A0A",
    marketMtgo: "#FBBF24",
    marketMtgoBg: "#451A03",

    rarityMythic: "#FB923C",
    rarityMythicBg: "#431407",
    rarityRare: "#FACC15",
    rarityRareBg: "#422006",
    rarityUncommon: "#9CA3AF",
    rarityUncommonBg: "#374151",
    rarityCommon: "#6B7280",
    rarityCommonBg: "#1F2937",
  },
} as const;

export type ThemeColors = typeof colors.light;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const typography = {
  title: {
    fontSize: 28,
    fontWeight: "800" as const,
    letterSpacing: -0.5,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700" as const,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontWeight: "400" as const,
    color: "#78716C",
  },
  label: {
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 0.3,
    textTransform: "uppercase" as const,
  },
  small: {
    fontSize: 11,
    fontWeight: "500" as const,
  },
} as const;

export const tabColors = {
  collection: { color: "#059669", bg: "#ECFDF5" },
  scanner: { color: "#E11D48", bg: "#FFF1F2" },
  decks: { color: "#7C3AED", bg: "#F5F3FF" },
  map: { color: "#0284C7", bg: "#E0F2FE" },
  profile: { color: "#0D9488", bg: "#F0FDFA" },
} as const;

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: "#1C1917",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),
  cardHover: Platform.select({
    ios: {
      shadowColor: "#1C1917",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
    },
    android: {
      elevation: 6,
    },
    default: {},
  }),
  elevated: Platform.select({
    ios: {
      shadowColor: "#1C1917",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
    },
    android: {
      elevation: 10,
    },
    default: {},
  }),
} as const;

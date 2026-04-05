// apps/mobile/src/theme.ts
import { Platform } from "react-native";

export const colors = {
  light: {
    bg:              "#F6F2EC",
    surface:         "#FDFAF6",
    surfaceRaised:   "#FFFFFF",
    surfaceSunken:   "#EDE7DC",

    textPrimary:     "#18150F",
    textSecondary:   "#6B5D4F",
    textMuted:       "#A8937C",
    textInverse:     "#FFFFFF",

    border:          "#DDD5C8",
    borderStrong:    "#C4B49A",

    accent:          "#C9A84C",
    accentHover:     "#A87C28",
    accentLight:     "#FFF8E1",
    accentText:      "#8B7030",

    success:         "#10B981",
    successLight:    "#ECFDF5",
    successText:     "#065F46",
    danger:          "#EF4444",
    dangerLight:     "#FEF2F2",
    dangerText:      "#991B1B",
    warning:         "#F59E0B",
    warningLight:    "#FFFBEB",
    warningText:     "#92400E",

    manaW: "#F9F3E3", manaWText: "#92700C",
    manaU: "#DBEAFE", manaUText: "#1E40AF",
    manaB: "#E5E5E5", manaBText: "#374151",
    manaR: "#FEE2E2", manaRText: "#991B1B",
    manaG: "#DCFCE7", manaGText: "#166534",

    marketTcg: "#C9A84C", marketTcgBg: "#FFF8E1",
    marketMkm: "#10B981", marketMkmBg: "#ECFDF5",
    marketCk:  "#3B82F6", marketCkBg:  "#EFF6FF",
    marketEbay: "#EF4444", marketEbayBg: "#FEF2F2",
    marketMtgo: "#F59E0B", marketMtgoBg: "#FFFBEB",

    rarityMythic:    "#FB923C",
    rarityMythicBg:  "#FFF4E6",
    rarityRare:      "#C9A84C",
    rarityRareBg:    "#FFFBEB",
    rarityUncommon:  "#94A3B8",
    rarityUncommonBg:"#F1F5F9",
    rarityCommon:    "#6B7280",
    rarityCommonBg:  "#F3F4F6",
  },
  dark: {
    bg:              "#0D0B09",
    surface:         "#161310",
    surfaceRaised:   "#1E1A16",
    surfaceSunken:   "#0A0807",

    textPrimary:     "#F2ECE4",
    textSecondary:   "#A89880",
    textMuted:       "#665A4A",
    textInverse:     "#0D0B09",

    border:          "#2A2420",
    borderStrong:    "#3D352C",

    accent:          "#C9A84C",
    accentHover:     "#E8C96C",
    accentLight:     "#2A1F06",
    accentText:      "#E8C96C",

    success:         "#34D399",
    successLight:    "#064E3B",
    successText:     "#6EE7B7",
    danger:          "#F87171",
    dangerLight:     "#450A0A",
    dangerText:      "#FCA5A5",
    warning:         "#C9A84C",
    warningLight:    "#2A1F06",
    warningText:     "#E8C96C",

    manaW: "#422006", manaWText: "#FDE68A",
    manaU: "#1E3A5F", manaUText: "#93C5FD",
    manaB: "#374151", manaBText: "#D1D5DB",
    manaR: "#450A0A", manaRText: "#FCA5A5",
    manaG: "#052E16", manaGText: "#86EFAC",

    marketTcg: "#C9A84C", marketTcgBg: "#2A1F06",
    marketMkm: "#34D399", marketMkmBg: "#064E3B",
    marketCk:  "#60A5FA", marketCkBg:  "#1E3A5F",
    marketEbay: "#F87171", marketEbayBg: "#450A0A",
    marketMtgo: "#C9A84C", marketMtgoBg: "#2A1F06",

    rarityMythic:    "#FB923C",
    rarityMythicBg:  "#431407",
    rarityRare:      "#C9A84C",
    rarityRareBg:    "#2A1F06",
    rarityUncommon:  "#94A3B8",
    rarityUncommonBg:"#374151",
    rarityCommon:    "#6B7280",
    rarityCommonBg:  "#1F2937",
  },
} as const;

export type ThemeColors = typeof colors.light;

/** Mana identity tint styles for card containers */
export const identityTints = {
  light: {
    W:     { backgroundColor: "#FFFDF0", borderColor: "#EDD87A" },
    U:     { backgroundColor: "#EFF6FF", borderColor: "#93C5FD" },
    B:     { backgroundColor: "#F5F3F8", borderColor: "#C4B5D4" },
    R:     { backgroundColor: "#FFF5F2", borderColor: "#FCA5A5" },
    G:     { backgroundColor: "#F0FBF3", borderColor: "#86EFAC" },
    multi: { backgroundColor: "#FFFBF0", borderColor: "#E8D5A0" },
    none:  { backgroundColor: "#FFFFFF", borderColor: "#DDD5C8" },
  },
  dark: {
    W:     { backgroundColor: "#1A1708", borderColor: "#5C4E10" },
    U:     { backgroundColor: "#091524", borderColor: "#1E3A5F" },
    B:     { backgroundColor: "#100D18", borderColor: "#2D1B4E" },
    R:     { backgroundColor: "#1A0A07", borderColor: "#5C1A1A" },
    G:     { backgroundColor: "#081409", borderColor: "#14532D" },
    multi: { backgroundColor: "#1A1608", borderColor: "#5C4A1A" },
    none:  { backgroundColor: "#1E1A16", borderColor: "#2A2420" },
  },
} as const;

export type IdentityKey = keyof typeof identityTints.light;

/** Returns the style object for a card container given its colorIdentity array */
export function getIdentityTintStyle(
  colorIdentity: string[],
  mode: "light" | "dark"
): { backgroundColor: string; borderColor: string } {
  const map = identityTints[mode];
  if (colorIdentity.length === 0) return map.none;
  if (colorIdentity.length >= 3) return map.multi;
  const first = colorIdentity[0].toUpperCase() as IdentityKey;
  return map[first] ?? map.none;
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16,
  xl: 20, "2xl": 24, "3xl": 32, "4xl": 48,
} as const;

export const radii = {
  sm: 8, md: 12, lg: 16, xl: 24, full: 9999,
} as const;

export const typography = {
  display: {
    fontSize: 32,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
    // fontFamily set at component level: 'Cinzel_700Regular'
  },
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
  stat: {
    fontSize: 16,
    fontWeight: "600" as const,
    letterSpacing: -0.5,
    fontVariantNumeric: "tabular-nums" as const,
  },
} as const;

export const tabColors = {
  collection: { color: "#059669", bg: "#ECFDF5" },
  scanner:    { color: "#E11D48", bg: "#FFF1F2" },
  decks:      { color: "#7C3AED", bg: "#F5F3FF" },
  map:        { color: "#0284C7", bg: "#E0F2FE" },
  profile:    { color: "#0D9488", bg: "#F0FDFA" },
} as const;

export const shadows = {
  card: Platform.select({
    ios:     { shadowColor: "#18150F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
    android: { elevation: 3 },
    default: {},
  }),
  cardHover: Platform.select({
    ios:     { shadowColor: "#18150F", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.14, shadowRadius: 36 },
    android: { elevation: 10 },
    default: {},
  }),
  elevated: Platform.select({
    ios:     { shadowColor: "#18150F", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24 },
    android: { elevation: 8 },
    default: {},
  }),
} as const;

export const rarityColors = {
  mythic:   "#FB923C",
  rare:     "#C9A84C",
  uncommon: "#94A3B8",
  common:   "#6B7280",
} as const;

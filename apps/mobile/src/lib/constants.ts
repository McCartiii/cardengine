// Point this at your API. In dev, use your machine's LAN IP.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export const SCANNER = {
  // How long the same text must be stable before we trigger identification
  STABILITY_MS: 350,
  // After scanning a card, block the same name from re-triggering for this long
  DEDUP_WINDOW_MS: 3000,
  // Minimum characters for a string to be considered a card name
  MIN_NAME_LEN: 3,
  // Maximum characters (card names are never this long)
  MAX_NAME_LEN: 40,
  // Score threshold below which we discard API matches
  MIN_CONFIDENCE_SCORE: 45,
  // Process every N frames (Vision Camera runs at ~30-60fps; we only need ~8/s)
  FRAME_INTERVAL: 6,
} as const;

export const COLORS = {
  bg: "#0a0a0a",
  background: "#0a0a0a",   // alias for bg — used across all screens
  surface: "#161616",
  surfaceHighlight: "#222222",
  accent: "#a855f7",       // purple — primary brand
  accentGlow: "#7c3aed",
  success: "#22c55e",
  warning: "#eab308",
  danger: "#ef4444",
  text: "#f5f5f5",
  textMuted: "#737373",
  border: "#262626",
} as const;

import { color } from "../design/tokens";

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

// Legacy palette for screens not yet moved to src/design/tokens. Values map
// onto the new tokens so every screen shares one look in the meantime.
export const COLORS = {
  bg: color.bg,
  background: color.bg,
  surface: color.surface,
  surfaceHighlight: color.surface2,
  accent: color.accent,
  accentGlow: color.accentPressed,
  onAccent: color.onAccent,
  success: color.positive,
  warning: color.accent,
  danger: color.negative,
  text: color.text,
  textMuted: color.textTertiary,
  border: color.border,
} as const;

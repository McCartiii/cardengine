import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:             "#0a0614",
        surface:        "#110d1f",
        "surface-2":    "#1a1430",
        accent:         "#8b5cf6",
        "accent-light": "#c4b5fd",
        cyan:           "#06b6d4",
        muted:          "#7c6f9a",
        border:         "#2a1f4a",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      keyframes: {
        enter: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to:   { backgroundPosition:  "200% 0" },
        },
        "mesh-shift": {
          "0%":   { opacity: "0.7", transform: "scale(1)" },
          "100%": { opacity: "1",   transform: "scale(1.06)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 12px rgba(139,92,246,0.25)" },
          "50%":      { boxShadow: "0 0 28px rgba(139,92,246,0.5)" },
        },
      },
      animation: {
        enter:        "enter 0.35s cubic-bezier(0.16,1,0.3,1) both",
        shimmer:      "shimmer 1.8s linear infinite",
        "mesh-shift": "mesh-shift 10s ease-in-out infinite alternate",
        "glow-pulse": "glow-pulse 2.4s ease-in-out infinite",
      },
      boxShadow: {
        glow:     "0 0 28px rgba(139,92,246,0.35)",
        "glow-sm":"0 0 12px rgba(139,92,246,0.2)",
        card:     "0 4px 24px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
} satisfies Config;

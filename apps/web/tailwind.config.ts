import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:          "#060810",
        surface:     "#0d1220",
        "surface-2": "#141b2d",
        "surface-3": "#1a2236",
        neon:        "#00d4ff",
        pink:        "#ff0080",
        violet:      "#7c3aed",
        muted:       "#3d5068",
        border:      "#1e2d45",
        gold:        "#f59e0b",
        cyan:        "#00d4ff",
        accent:      "#7c3aed",
        "accent-light": "#a78bfa",
      },
      fontFamily: {
        sans:    ["Space Grotesk", "system-ui", "sans-serif"],
        display: ["Syne", "system-ui", "sans-serif"],
      },
      keyframes: {
        enter: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to:   { opacity: "1", transform: "translateY(0)"    },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to:   { backgroundPosition:  "200% 0" },
        },
        "mesh-shift": {
          "0%":   { opacity: "0.7", transform: "scale(1)"    },
          "100%": { opacity: "1",   transform: "scale(1.04)" },
        },
        "holo-shift": {
          "0%":   { backgroundPosition: "0% 50%"   },
          "50%":  { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%"   },
        },
        "neon-pulse": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(0,212,255,0.3), 0 0 20px rgba(0,212,255,0.1)"  },
          "50%":      { boxShadow: "0 0 16px rgba(0,212,255,0.6), 0 0 40px rgba(0,212,255,0.2)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)"  },
          "50%":      { transform: "translateY(-4px)" },
        },
        "radar-pulse": {
          "0%":   { transform: "scale(0.8)", opacity: "1" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
      },
      animation: {
        enter:        "enter 0.35s cubic-bezier(0.16,1,0.3,1) both",
        shimmer:      "shimmer 1.8s linear infinite",
        "mesh-shift": "mesh-shift 12s ease-in-out infinite alternate",
        "holo-shift": "holo-shift 4s linear infinite",
        "neon-pulse": "neon-pulse 2.4s ease-in-out infinite",
        float:        "float 4s ease-in-out infinite",
        "radar-pulse":"radar-pulse 1.5s ease-out infinite",
      },
      boxShadow: {
        neon:     "0 0 20px rgba(0,212,255,0.4), 0 0 40px rgba(0,212,255,0.15)",
        "neon-sm":"0 0 10px rgba(0,212,255,0.3)",
        pink:     "0 0 20px rgba(255,0,128,0.4)",
        glow:     "0 0 28px rgba(124,58,237,0.35)",
        card:     "0 4px 24px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
} satisfies Config;

const { hairlineWidth } = require("nativewind/theme");

/** @type {import("tailwindcss").Config} */
module.exports = {
  // NativeWind preset enables the RN-compatible subset of Tailwind
  presets: [require("nativewind/preset")],
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── SF Dark Pro palette ────────────────────────────────────────────
        obsidian:  "#070708",
        volt:      "#CCFF00",
        "volt-dim":"#a3e635",  // tactical neon-lime (muted)
        cyan:      "#00F0FF",
        // ── Extended zinc matrix ───────────────────────────────────────────
        zinc: {
          950: "#0a0a0b",
          900: "#18181b",
          800: "#27272a",
          700: "#3f3f46",
          600: "#52525b",
          500: "#71717a",
          400: "#a1a1aa",
          300: "#d4d4d8",
          200: "#e4e4e7",
          100: "#f4f4f5",
          50:  "#fafafa",
        },
        // ── Alert / biometric ─────────────────────────────────────────────
        "hr-red":   "#ef4444",
        "hr-amber": "#f59e0b",
        "hr-lime":  "#a3e635",
      },
      fontFamily: {
        mono:       ["Courier New", "monospace"],
        condensed:  ["Barlow Condensed", "sans-serif"],
        display:    ["Barlow Condensed", "sans-serif"],
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
      spacing: {
        "safe-bottom": "34px", // iOS home indicator clearance
      },
    },
  },
  plugins: [],
};

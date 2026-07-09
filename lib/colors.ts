// Design token mirror of ROADMAP.md § SF Dark Pro palette
// Use in StyleSheet.create() or inline style props where className isn't available

export const C = {
  // Backgrounds
  obsidian:  "#070708",
  black:     "#000000",
  surface:   "#0a0a0b",  // zinc-950

  // Zinc scale
  z900: "#18181b",
  z800: "#27272a",
  z700: "#3f3f46",
  z600: "#52525b",
  z500: "#71717a",
  z400: "#a1a1aa",

  // Accent
  volt:     "#CCFF00",
  voltDim:  "#a3e635",
  cyan:     "#00F0FF",

  // Semantic
  red:   "#ef4444",
  amber: "#f59e0b",
  green: "#22c55e",
} as const;

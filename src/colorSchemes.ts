import type { ColorSchemeId, Theme } from "./types";

export interface ColorScheme {
  id: ColorSchemeId;
  name: string;
  theme: Theme;
  swatches: readonly [string, string, string];
}

export const DEFAULT_LIGHT_COLOR_SCHEME: ColorSchemeId = "github-light";
export const DEFAULT_DARK_COLOR_SCHEME: ColorSchemeId = "vs-code-dark-plus";

export const COLOR_SCHEMES = [
  {
    id: "github-light",
    name: "GitHub Light",
    theme: "light",
    swatches: ["#ffffff", "#0969da", "#1f2328"]
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    theme: "dark",
    swatches: ["#0d1117", "#58a6ff", "#f0f6fc"]
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    theme: "light",
    swatches: ["#fdf6e3", "#268bd2", "#586e75"]
  },
  {
    id: "vs-code-dark-plus",
    name: "VS Code Dark+",
    theme: "dark",
    swatches: ["#1e1e1e", "#007acc", "#d4d4d4"]
  },
  {
    id: "one-dark-pro",
    name: "One Dark Pro",
    theme: "dark",
    swatches: ["#282c34", "#61afef", "#abb2bf"]
  },
  {
    id: "dracula",
    name: "Dracula",
    theme: "dark",
    swatches: ["#282a36", "#bd93f9", "#f8f8f2"]
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    theme: "dark",
    swatches: ["#1e1e2e", "#cba6f7", "#cdd6f4"]
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    theme: "dark",
    swatches: ["#1a1b26", "#7aa2f7", "#c0caf5"]
  },
  {
    id: "night-owl",
    name: "Night Owl",
    theme: "dark",
    swatches: ["#011627", "#82aaff", "#d6deeb"]
  },
  {
    id: "monokai",
    name: "Monokai",
    theme: "dark",
    swatches: ["#272822", "#a6e22e", "#f8f8f2"]
  },
  {
    id: "synthwave-84",
    name: "SynthWave '84",
    theme: "dark",
    swatches: ["#2b213a", "#ff7edb", "#f8f8f2"]
  },
  {
    id: "material-palenight",
    name: "Material Palenight",
    theme: "dark",
    swatches: ["#292d3e", "#82aaff", "#a6accd"]
  },
  {
    id: "kanagawa",
    name: "Kanagawa",
    theme: "dark",
    swatches: ["#1f1f28", "#7e9cd8", "#dcd7ba"]
  },
  {
    id: "rose-pine",
    name: "Rose Pine",
    theme: "dark",
    swatches: ["#191724", "#ebbcba", "#e0def4"]
  },
  {
    id: "ayu-dark",
    name: "Ayu Dark",
    theme: "dark",
    swatches: ["#0b0e14", "#ffb454", "#b3b1ad"]
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    theme: "dark",
    swatches: ["#282828", "#fabd2f", "#ebdbb2"]
  },
  {
    id: "everforest-dark",
    name: "Everforest Dark",
    theme: "dark",
    swatches: ["#2f383e", "#a7c080", "#d3c6aa"]
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    theme: "dark",
    swatches: ["#002b36", "#268bd2", "#839496"]
  },
  {
    id: "nord",
    name: "Nord",
    theme: "dark",
    swatches: ["#2e3440", "#88c0d0", "#d8dee9"]
  }
] as const satisfies readonly ColorScheme[];

const COLOR_SCHEME_IDS = new Set<ColorSchemeId>(COLOR_SCHEMES.map((scheme) => scheme.id));

export function isColorSchemeId(value: unknown): value is ColorSchemeId {
  return typeof value === "string" && COLOR_SCHEME_IDS.has(value as ColorSchemeId);
}

export function getColorScheme(id: ColorSchemeId): ColorScheme {
  return COLOR_SCHEMES.find((scheme) => scheme.id === id) ?? COLOR_SCHEMES[0];
}

export function defaultColorSchemeForTheme(theme: Theme): ColorSchemeId {
  return theme === "dark" ? DEFAULT_DARK_COLOR_SCHEME : DEFAULT_LIGHT_COLOR_SCHEME;
}

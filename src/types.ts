export type Theme = "light" | "dark";

export type ColorSchemeId =
  | "ayu-dark"
  | "catppuccin-mocha"
  | "dracula"
  | "everforest-dark"
  | "github-dark"
  | "github-light"
  | "gruvbox-dark"
  | "material-palenight"
  | "monokai"
  | "nord"
  | "one-dark-pro"
  | "rose-pine"
  | "solarized-dark"
  | "solarized-light"
  | "synthwave-84"
  | "tokyo-night"
  | "kanagawa"
  | "night-owl"
  | "vs-code-dark-plus";

export type ViewMode = "markdown" | "split" | "preview";

export type SaveState = "loading" | "saved" | "saving" | "unavailable" | "conflict";

export type RenderState = "rendering" | "ready" | "error" | "paused";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface HeadingItem {
  level: number;
  text: string;
  id: string;
  line?: number;
}

export interface DiagnosticItem {
  severity: DiagnosticSeverity;
  message: string;
  line?: number;
}

export interface RenderResult {
  html: string;
  headings: HeadingItem[];
  diagnostics: DiagnosticItem[];
}

export interface RenderRequest {
  type: "render";
  version: number;
  markdown: string;
}

export interface RenderedResponse {
  type: "rendered";
  version: number;
  result: RenderResult;
}

export interface RenderErrorResponse {
  type: "render_error";
  version: number;
  error: string;
}

export type WorkerRequest = RenderRequest;
export type WorkerResponse = RenderedResponse | RenderErrorResponse;

export interface Preferences {
  theme: Theme;
  colorScheme: ColorSchemeId;
  outlineVisible: boolean;
  splitRatio: number;
}

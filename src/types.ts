export type Theme = "light" | "dark";

export type MobileMode = "editor" | "preview";

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
  outlineVisible: boolean;
  splitRatio: number;
}

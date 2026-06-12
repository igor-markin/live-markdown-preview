import { MAX_LIVE_RENDER_CHARS, MAX_PREVIEW_HTML_CHARS } from "./limits";

export function shouldPauseLiveRender(markdown: string): boolean {
  return markdown.length > MAX_LIVE_RENDER_CHARS;
}

export function shouldPausePreviewHtml(html: string): boolean {
  return html.length > MAX_PREVIEW_HTML_CHARS;
}

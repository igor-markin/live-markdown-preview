import { describe, expect, it } from "vitest";
import { MAX_LIVE_RENDER_CHARS, MAX_PREVIEW_HTML_CHARS } from "./limits";
import { shouldPauseLiveRender, shouldPausePreviewHtml } from "./renderPolicy";

describe("render policy", () => {
  it("pauses live render only after the Markdown size limit", () => {
    expect(shouldPauseLiveRender("a".repeat(MAX_LIVE_RENDER_CHARS))).toBe(false);
    expect(shouldPauseLiveRender("a".repeat(MAX_LIVE_RENDER_CHARS + 1))).toBe(true);
  });

  it("pauses preview sanitization only after the HTML output size limit", () => {
    expect(shouldPausePreviewHtml("a".repeat(MAX_PREVIEW_HTML_CHARS))).toBe(false);
    expect(shouldPausePreviewHtml("a".repeat(MAX_PREVIEW_HTML_CHARS + 1))).toBe(true);
  });
});

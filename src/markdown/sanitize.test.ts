import { describe, expect, it } from "vitest";
import { LARGE_PREVIEW_STATUS, MAX_PREVIEW_HTML_CHARS } from "../limits";
import { createPreviewHtmlState, getCopyableHtml } from "./previewHtml";
import { sanitizeMarkdownHtml } from "./sanitize";

describe("sanitizeMarkdownHtml", () => {
  it("removes unsafe raw HTML before preview", () => {
    const safe = sanitizeMarkdownHtml(
      '<p>Ok</p><img src="x" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">bad</a><svg><script>alert(1)</script></svg><math><mi>x</mi></math>'
    );

    expect(safe).toContain("<p>Ok</p>");
    expect(safe).not.toContain("onerror");
    expect(safe).not.toContain("<script>");
    expect(safe).not.toContain("javascript:");
    expect(safe).not.toContain("<svg");
    expect(safe).not.toContain("<math");
  });

  it("hardens links and raw form controls after sanitization", () => {
    const safe = sanitizeMarkdownHtml(
      '<a href="https://example.com">external</a><a href="#title">heading</a><input type="text" value="x"><input type="checkbox" checked><form><button>Go</button></form>'
    );

    expect(safe).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">external</a>');
    expect(safe).toContain('<a href="#title">heading</a>');
    expect(safe).toContain('<input type="checkbox" checked="" disabled="">');
    expect(safe).not.toContain('type="text"');
    expect(safe).not.toContain("<form");
    expect(safe).not.toContain("<button");
  });

  it("removes unsafe link and image URLs after DOMPurify", () => {
    const safe = sanitizeMarkdownHtml(
      [
        '<a href="data:text/html,<script>alert(1)</script>">data link</a>',
        '<a href="blob:https://example.com/id">blob link</a>',
        '<a href="file:///etc/passwd">file link</a>',
        '<a href="mailto:test@example.com">mail</a>',
        '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
        '<img src="data:image/png;base64,aGVsbG8=" srcset="https://tracker.example/pixel.png 1x">',
        '<img src="https://tracker.example/pixel.png">'
      ].join("")
    );

    expect(safe).toContain('<a>data link</a>');
    expect(safe).toContain('<a>blob link</a>');
    expect(safe).toContain('<a>file link</a>');
    expect(safe).toContain('<a href="mailto:test@example.com" target="_blank" rel="noopener noreferrer">mail</a>');
    expect(safe).toContain('<img src="data:image/png;base64,aGVsbG8=">');
    expect(safe).not.toContain("data:image/svg+xml");
    expect(safe).not.toContain("tracker.example");
    expect(safe).not.toContain("srcset");
  });

  it("copies sanitized preview HTML instead of raw worker HTML", () => {
    const preview = createPreviewHtmlState('<h1>Safe</h1><script>alert("bad")</script>');
    const copyable = getCopyableHtml(preview);

    expect(copyable).toBe(preview.safeHtml);
    expect(copyable).toContain("<h1>Safe</h1>");
    expect(copyable).not.toContain("<script>");
  });

  it("compacts excessive blank lines in copied HTML between rendered blocks", () => {
    const preview = createPreviewHtmlState(
      `<p>Intro line</p>${"\n".repeat(126)}<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alpha</td></tr></tbody></table>`
    );
    const copyable = getCopyableHtml(preview);

    expect(copyable).toContain("<p>Intro line</p>");
    expect(copyable).toContain("<table>");
    expect(copyable).not.toContain("\n\n\n");
  });

  it("preserves blank lines inside copied code blocks", () => {
    const preview = createPreviewHtmlState(`<pre><code>line 1\n\n\nline 2</code></pre>${"\n".repeat(20)}<p>After</p>`);
    const copyable = getCopyableHtml(preview);

    expect(copyable).toContain("line 1\n\n\nline 2");
    expect(copyable).toContain("</pre>\n<p>After</p>");
  });

  it("does not sanitize preview HTML beyond the main-thread budget", () => {
    const preview = createPreviewHtmlState(`<p>${"x".repeat(MAX_PREVIEW_HTML_CHARS)}</p>`);

    expect(preview.safeHtml).toContain(LARGE_PREVIEW_STATUS);
    expect(preview.safeHtml).not.toContain("x".repeat(100));
  });
});

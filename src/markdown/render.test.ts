import { describe, expect, it } from "vitest";
import { MAX_OUTLINE_HEADINGS } from "../limits";
import { renderMarkdown } from "./render";

describe("renderMarkdown", () => {
  it("renders GFM tables and task lists", async () => {
    const result = await renderMarkdown(`- [x] Done

| Name | Value |
| --- | ---: |
| Alpha | 1 |
`);

    expect(result.html).toContain("<table>");
    expect(result.html).toContain("<input");
    expect(result.html).toContain("checked");
    expect(result.html).toContain("<td align=\"right\">1</td>");
  });

  it("allows raw HTML in worker output before main-thread sanitization", async () => {
    const result = await renderMarkdown("<section><strong>Allowed</strong></section>");

    expect(result.html).toContain("<section>");
    expect(result.html).toContain("<strong>Allowed</strong>");
  });

  it("adds stable heading ids and heading metadata", async () => {
    const result = await renderMarkdown(`# Title

## Title
`);

    expect(result.html).toContain('<h1 id="title">Title</h1>');
    expect(result.html).toContain('<h2 id="title-2">Title</h2>');
    expect(result.headings).toEqual([
      { level: 1, text: "Title", id: "title", line: 1 },
      { level: 2, text: "Title", id: "title-2", line: 3 }
    ]);
  });

  it("keeps heading ids unique when natural numeric suffixes collide", async () => {
    const result = await renderMarkdown(`# A

## A

### A-2

#### A
`);

    expect(result.headings.map((heading) => heading.id)).toEqual(["a", "a-2", "a-2-2", "a-3"]);
    expect(new Set(result.headings.map((heading) => heading.id)).size).toBe(4);
  });

  it("normalizes canonically equivalent Unicode headings consistently", async () => {
    const result = await renderMarkdown(`# Caf\u00e9

## Cafe\u0301
`);

    expect(result.headings.map((heading) => heading.id)).toEqual(["cafe", "cafe-2"]);
  });

  it("caps outline headings and reports a diagnostic", async () => {
    const markdown = Array.from({ length: MAX_OUTLINE_HEADINGS + 2 }, (_, index) => `# Heading ${index + 1}`).join("\n");
    const result = await renderMarkdown(markdown);

    expect(result.headings).toHaveLength(MAX_OUTLINE_HEADINGS);
    expect(result.html).toContain(`id="heading-${MAX_OUTLINE_HEADINGS + 2}"`);
    expect(result.diagnostics).toContainEqual({
      severity: "warning",
      message: `Outline truncated to first ${MAX_OUTLINE_HEADINGS} headings.`
    });
  });
});

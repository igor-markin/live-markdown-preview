import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { MAX_OUTLINE_HEADINGS } from "../limits";
import type { DiagnosticItem, HeadingItem, RenderResult } from "../types";

interface MarkdownNode {
  type?: string;
  depth?: number;
  value?: string;
  children?: MarkdownNode[];
  position?: {
    start?: {
      line?: number;
    };
  };
  data?: {
    hProperties?: Record<string, string>;
  };
}

export async function renderMarkdown(markdown: string): Promise<RenderResult> {
  const headings: HeadingItem[] = [];
  const headingState = {
    headings,
    total: 0
  };

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(() => (tree: MarkdownNode) => {
      addHeadingIds(tree, headingState);
    })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(markdown);

  const diagnostics = file.messages.map((message): DiagnosticItem => {
      const line = message.place && "line" in message.place ? message.place.line : undefined;

      return {
        severity: message.fatal ? "error" : "warning",
        message: message.message,
        line
      };
    });

  if (headingState.total > MAX_OUTLINE_HEADINGS) {
    diagnostics.push({
      severity: "warning",
      message: `Outline truncated to first ${MAX_OUTLINE_HEADINGS} headings.`
    });
  }

  return {
    html: String(file),
    headings,
    diagnostics
  };
}

function addHeadingIds(
  tree: MarkdownNode,
  state: { headings: HeadingItem[]; total: number }
): void {
  const slugger = createSlugger();

  walk(tree, (node) => {
    if (node.type !== "heading" || typeof node.depth !== "number") {
      return;
    }

    const text = getNodeText(node).trim();
    const id = slugger(text);

    node.data = node.data ?? {};
    node.data.hProperties = {
      ...node.data.hProperties,
      id
    };

    state.total += 1;

    if (state.headings.length < MAX_OUTLINE_HEADINGS) {
      state.headings.push({
        level: node.depth,
        text,
        id,
        line: node.position?.start?.line
      });
    }
  });
}

function walk(node: MarkdownNode, visitor: (node: MarkdownNode) => void): void {
  visitor(node);

  for (const child of node.children ?? []) {
    walk(child, visitor);
  }
}

function getNodeText(node: MarkdownNode): string {
  if (typeof node.value === "string") {
    return node.value;
  }

  return (node.children ?? []).map(getNodeText).join("");
}

function createSlugger(): (text: string) => string {
  const counts = new Map<string, number>();

  return (text: string) => {
    const base =
      text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "-") || "heading";

    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);

    return count === 0 ? base : `${base}-${count + 1}`;
  };
}

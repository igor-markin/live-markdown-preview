import { LARGE_PREVIEW_STATUS } from "../limits";
import { shouldPausePreviewHtml } from "../renderPolicy";
import { sanitizeMarkdownHtml } from "./sanitize";

export interface PreviewHtmlState {
  safeHtml: string;
}

export function createPreviewHtmlState(rawWorkerHtml: string): PreviewHtmlState {
  if (shouldPausePreviewHtml(rawWorkerHtml)) {
    return {
      safeHtml: createPreviewMessageHtml(LARGE_PREVIEW_STATUS)
    };
  }

  return {
    safeHtml: sanitizeMarkdownHtml(rawWorkerHtml)
  };
}

export function getCopyableHtml(state: PreviewHtmlState): string {
  return compactCopyableHtml(state.safeHtml);
}

function compactCopyableHtml(html: string): string {
  if (typeof document === "undefined") {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  compactTextNodes(template.content, false);

  return template.innerHTML.trim();
}

function compactTextNodes(node: Node, preserveWhitespace: boolean): void {
  for (const child of Array.from(node.childNodes)) {
    const shouldPreserve = preserveWhitespace || isWhitespacePreservingElement(child);

    if (child.nodeType === 3 && !shouldPreserve && child.textContent) {
      child.textContent = child.textContent.replace(/(?:[ \t]*\r?\n){2,}[ \t]*/g, "\n");
      continue;
    }

    compactTextNodes(child, shouldPreserve);
  }
}

function isWhitespacePreservingElement(node: Node): boolean {
  if (node.nodeType !== 1) {
    return false;
  }

  const tagName = (node as Element).tagName.toLowerCase();

  return tagName === "pre" || tagName === "code" || tagName === "textarea";
}

function createPreviewMessageHtml(message: string): string {
  return `<p class="preview-message">${escapeHtml(message)}</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

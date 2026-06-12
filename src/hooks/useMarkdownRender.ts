import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { LARGE_DOCUMENT_STATUS, LARGE_PREVIEW_STATUS } from "../limits";
import { createPreviewHtmlState, type PreviewHtmlState } from "../markdown/previewHtml";
import { shouldPauseLiveRender, shouldPausePreviewHtml } from "../renderPolicy";
import type { DiagnosticItem, HeadingItem, RenderState } from "../types";
import { MarkdownWorkerClient } from "../workerClient";

interface MarkdownRenderResult {
  diagnostics: DiagnosticItem[];
  headings: HeadingItem[];
  isPreviewFresh: (actionId: string) => boolean;
  previewHtml: PreviewHtmlState;
  renderDurationMs: number | null;
  renderMessage: string;
  renderState: RenderState;
}

export function useMarkdownRender(
  markdown: string,
  completeAction: (actionId: string, message: string) => void
): MarkdownRenderResult {
  const workerRef = useRef<MarkdownWorkerClient | null>(null);
  const lastRenderedMarkdownRef = useRef<string | null>(null);

  const [previewHtml, setPreviewHtml] = useState<PreviewHtmlState>(() => createPreviewHtmlState(""));
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [renderState, setRenderState] = useState<RenderState>("rendering");
  const [renderDurationMs, setRenderDurationMs] = useState<number | null>(null);
  const [renderMessage, setRenderMessage] = useState("");

  useEffect(() => {
    const worker = new MarkdownWorkerClient();
    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (shouldPauseLiveRender(markdown)) {
      lastRenderedMarkdownRef.current = null;
      setPreviewHtml(createPreviewHtmlState(createPreviewMessageHtml(LARGE_DOCUMENT_STATUS)));
      setHeadings([]);
      setDiagnostics([{ severity: "warning", message: LARGE_DOCUMENT_STATUS }]);
      setRenderDurationMs(null);
      setRenderMessage(LARGE_DOCUMENT_STATUS);
      setRenderState("paused");
      return;
    }

    setRenderState("rendering");
    setRenderDurationMs(null);
    setRenderMessage("");

    const timeout = window.setTimeout(() => {
      const worker = workerRef.current;

      if (!worker) {
        lastRenderedMarkdownRef.current = null;
        setPreviewHtml(createPreviewHtmlState(createPreviewMessageHtml("Render unavailable")));
        setDiagnostics([{ severity: "error", message: "Render unavailable" }]);
        setRenderMessage("Render unavailable");
        setRenderState("error");
        return;
      }

      const renderStartedAt = performance.now();
      const renderMarkdownSource = markdown;

      worker.render(markdown, {
        onRendered: (result) => {
          if (shouldPausePreviewHtml(result.html)) {
            lastRenderedMarkdownRef.current = null;
            setPreviewHtml(createPreviewHtmlState(createPreviewMessageHtml(LARGE_PREVIEW_STATUS)));
            setHeadings(result.headings);
            setDiagnostics([...result.diagnostics, { severity: "warning", message: LARGE_PREVIEW_STATUS }]);
            setRenderDurationMs(Math.max(0, Math.round(performance.now() - renderStartedAt)));
            setRenderMessage(LARGE_PREVIEW_STATUS);
            setRenderState("paused");
            return;
          }

          const nextPreviewHtml = createPreviewHtmlState(result.html);

          lastRenderedMarkdownRef.current = renderMarkdownSource;
          setPreviewHtml(nextPreviewHtml);
          setHeadings(result.headings);
          setDiagnostics(result.diagnostics);
          setRenderDurationMs(Math.max(0, Math.round(performance.now() - renderStartedAt)));
          setRenderMessage("");
          setRenderState("ready");
        },
        onError: (error) => {
          const message = error === "Render timed out" || error === "Render unavailable" ? error : "Render error";

          lastRenderedMarkdownRef.current = null;
          setPreviewHtml(createPreviewHtmlState(createPreviewMessageHtml(message)));
          setDiagnostics([{ severity: "error", message: error }]);
          setRenderDurationMs(Math.max(0, Math.round(performance.now() - renderStartedAt)));
          setRenderMessage(message);
          setRenderState("error");
        }
      });
    }, 60);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [markdown]);

  const isPreviewFresh = useCallback(
    (actionId: string) => {
      if (renderState === "ready" && lastRenderedMarkdownRef.current === markdown) {
        return true;
      }

      completeAction(actionId, "Preview is not ready yet");
      return false;
    },
    [completeAction, markdown, renderState]
  );

  return {
    diagnostics,
    headings,
    isPreviewFresh,
    previewHtml,
    renderDurationMs,
    renderMessage,
    renderState
  };
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

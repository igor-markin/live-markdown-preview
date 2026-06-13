import {
  Clipboard,
  Code2,
  CircleHelp,
  GitFork,
  Moon,
  Printer,
  Sun
} from "lucide-preact";
import type { Theme } from "../types";

interface ToolbarProps {
  activeAction: string | null;
  githubUrl: string;
  theme: Theme;
  onCopyHtml: () => void;
  onCopyMarkdown: () => void;
  onExportPdf: () => void;
  onOpenHelp: () => void;
  onToggleTheme: () => void;
}

export function Toolbar({
  activeAction,
  githubUrl,
  theme,
  onCopyHtml,
  onCopyMarkdown,
  onExportPdf,
  onOpenHelp,
  onToggleTheme
}: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Document actions">
      <button
        type="button"
        className={actionClass(activeAction, "copy-markdown")}
        onClick={onCopyMarkdown}
        title="Copy Markdown source"
        aria-label="Copy Markdown source"
      >
        <Clipboard size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={actionClass(activeAction, "copy-html")}
        onClick={onCopyHtml}
        title="Copy sanitized HTML"
        aria-label="Copy sanitized HTML"
      >
        <Code2 size={16} aria-hidden="true" />
      </button>
      <span className="toolbar-separator" aria-hidden="true" />
      <button
        type="button"
        className={actionClass(activeAction, "pdf")}
        onClick={onExportPdf}
        title="Export PDF"
        aria-label="Export PDF"
      >
        <Printer size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={actionClass(activeAction, "help")}
        onClick={onOpenHelp}
        title="Help"
        aria-label="Help"
      >
        <CircleHelp size={16} aria-hidden="true" />
      </button>
      <a
        className="icon-link"
        href={githubUrl}
        target="_blank"
        rel="noreferrer"
        title="Open GitHub repository"
        aria-label="Open GitHub repository"
      >
        <GitFork size={16} aria-hidden="true" />
      </a>
      <span className="toolbar-separator" aria-hidden="true" />
      <button
        type="button"
        className={actionClass(activeAction, "theme")}
        onClick={onToggleTheme}
        title="Toggle Theme"
        aria-label="Toggle Theme"
      >
        {theme === "light" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}

function actionClass(activeAction: string | null, actionId: string): string {
  return activeAction === actionId ? "is-action-complete" : "";
}

import {
  Clipboard,
  Code2,
  GitFork,
  Info,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Printer,
  Redo2,
  Sun,
  Undo2
} from "lucide-preact";
import type { Theme } from "../types";

interface ToolbarProps {
  activeAction: string | null;
  githubUrl: string;
  outlineVisible: boolean;
  theme: Theme;
  onCopyHtml: () => void;
  onCopyMarkdown: () => void;
  onExportPdf: () => void;
  onOpenAbout: () => void;
  onRedo: () => void;
  onToggleOutline: () => void;
  onToggleTheme: () => void;
  onUndo: () => void;
}

export function Toolbar({
  activeAction,
  githubUrl,
  outlineVisible,
  theme,
  onCopyHtml,
  onCopyMarkdown,
  onExportPdf,
  onOpenAbout,
  onRedo,
  onToggleOutline,
  onToggleTheme,
  onUndo
}: ToolbarProps) {
  return (
    <div className="toolbar" aria-label="Document actions">
      <button
        type="button"
        className={actionClass(activeAction, "undo")}
        onClick={onUndo}
        title="Undo"
        aria-label="Undo"
      >
        <Undo2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={actionClass(activeAction, "redo")}
        onClick={onRedo}
        title="Redo"
        aria-label="Redo"
      >
        <Redo2 size={16} aria-hidden="true" />
      </button>
      <span className="toolbar-separator" aria-hidden="true" />
      <button
        type="button"
        className={actionClass(activeAction, "outline")}
        onClick={onToggleOutline}
        title={outlineVisible ? "Hide Outline" : "Show Outline"}
        aria-label={outlineVisible ? "Hide Outline" : "Show Outline"}
        aria-pressed={outlineVisible}
      >
        {outlineVisible ? <PanelLeftClose size={16} aria-hidden="true" /> : <PanelLeft size={16} aria-hidden="true" />}
        <span>Outline</span>
      </button>
      <span className="toolbar-separator" aria-hidden="true" />
      <button
        type="button"
        className={actionClass(activeAction, "copy-markdown")}
        onClick={onCopyMarkdown}
        title="Copy Markdown"
        aria-label="Copy Markdown"
      >
        <Clipboard size={16} aria-hidden="true" />
        <span>Markdown</span>
      </button>
      <button
        type="button"
        className={actionClass(activeAction, "copy-html")}
        onClick={onCopyHtml}
        title="Copy sanitized HTML"
        aria-label="Copy sanitized HTML"
      >
        <Code2 size={16} aria-hidden="true" />
        <span>HTML</span>
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
        <span>PDF</span>
      </button>
      <span className="toolbar-separator" aria-hidden="true" />
      <button
        type="button"
        className={actionClass(activeAction, "about")}
        onClick={onOpenAbout}
        title="About"
        aria-label="About"
      >
        <Info size={16} aria-hidden="true" />
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
        <span>GitHub</span>
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

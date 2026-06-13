import {
  Check,
  ChevronDown,
  Clipboard,
  Code2,
  CircleHelp,
  GitFork,
  Palette,
  Printer
} from "lucide-preact";
import type { ColorScheme } from "../colorSchemes";
import type { ColorSchemeId } from "../types";

interface ToolbarProps {
  activeAction: string | null;
  colorScheme: ColorSchemeId;
  colorSchemes: readonly ColorScheme[];
  githubUrl: string;
  onCopyHtml: () => void;
  onCopyMarkdown: () => void;
  onExportPdf: () => void;
  onOpenHelp: () => void;
  onSelectColorScheme: (schemeId: ColorSchemeId) => void;
}

export function Toolbar({
  activeAction,
  colorScheme,
  colorSchemes,
  githubUrl,
  onCopyHtml,
  onCopyMarkdown,
  onExportPdf,
  onOpenHelp,
  onSelectColorScheme
}: ToolbarProps) {
  const currentScheme = colorSchemes.find((scheme) => scheme.id === colorScheme) ?? colorSchemes[0];

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
        rel="noopener noreferrer"
        title="Open GitHub repository"
        aria-label="Open GitHub repository"
      >
        <GitFork size={16} aria-hidden="true" />
      </a>
      <span className="toolbar-separator" aria-hidden="true" />
      <details className={`scheme-picker ${actionClass(activeAction, "scheme")}`} aria-label="Color scheme">
        <summary role="button" aria-haspopup="menu" title={`Color scheme: ${currentScheme.name}`} aria-label="Color scheme">
          <Palette size={16} aria-hidden="true" />
          <span>{currentScheme.name}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="scheme-menu" role="menu" aria-label="Color schemes">
          {colorSchemes.map((scheme) => (
            <button
              key={scheme.id}
              type="button"
              role="menuitemradio"
              aria-checked={scheme.id === colorScheme}
              onClick={(event) => {
                onSelectColorScheme(scheme.id);
                closeSchemePicker(event.currentTarget);
              }}
            >
              <span className="scheme-swatch" aria-hidden="true">
                {scheme.swatches.map((swatch) => (
                  <span key={swatch} style={{ background: swatch }} />
                ))}
              </span>
              <span>{scheme.name}</span>
              {scheme.id === colorScheme && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function actionClass(activeAction: string | null, actionId: string): string {
  return activeAction === actionId ? "is-action-complete" : "";
}

function closeSchemePicker(target: HTMLElement): void {
  target.closest("details")?.removeAttribute("open");
}

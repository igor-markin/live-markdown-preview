import {
  Check,
  ChevronDown,
  Clipboard,
  Code2,
  CircleHelp,
  ExternalLink,
  Palette,
  Printer
} from "lucide-preact";
import type { JSX } from "preact";
import { useRef } from "preact/hooks";
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
  const schemePickerRef = useRef<HTMLDetailsElement | null>(null);
  const schemeSummaryRef = useRef<HTMLElement | null>(null);
  const schemeMenuRef = useRef<HTMLDivElement | null>(null);
  const currentScheme = colorSchemes.find((scheme) => scheme.id === colorScheme) ?? colorSchemes[0];

  const focusSchemeOption = (position: "selected" | "first" | "last") => {
    window.setTimeout(() => {
      const options = Array.from(schemeMenuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const selectedIndex = options.findIndex((option) => option.getAttribute("aria-checked") === "true");
      const targetIndex = position === "first" ? 0 : position === "last" ? options.length - 1 : Math.max(0, selectedIndex);

      options[targetIndex]?.focus();
    }, 0);
  };

  const handleSchemeSummaryKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();

    if (schemePickerRef.current) {
      schemePickerRef.current.open = true;
    }

    focusSchemeOption(event.key === "ArrowUp" ? "last" : "selected");
  };

  const handleSchemeMenuKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "Escape") {
      event.preventDefault();
      schemePickerRef.current?.removeAttribute("open");
      schemeSummaryRef.current?.focus();
      return;
    }

    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % options.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      options[nextIndex]?.focus();
    }
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Document actions">
      <button
        type="button"
        className={`primary-action ${actionClass(activeAction, "copy-markdown")}`}
        onClick={onCopyMarkdown}
        title="Copy Markdown source"
        aria-label="Copy Markdown source"
      >
        <Clipboard size={16} aria-hidden="true" />
        <span>Copy Markdown</span>
      </button>
      <button
        type="button"
        className={`primary-action ${actionClass(activeAction, "copy-html")}`}
        onClick={onCopyHtml}
        title="Copy clean HTML code"
        aria-label="Copy clean HTML code"
      >
        <Code2 size={16} aria-hidden="true" />
        <span>Copy HTML</span>
      </button>
      <span className="toolbar-separator" aria-hidden="true" />
      <button
        type="button"
        className={`primary-action ${actionClass(activeAction, "pdf")}`}
        onClick={onExportPdf}
        title="Print / Save PDF"
        aria-label="Print / Save PDF"
      >
        <Printer size={16} aria-hidden="true" />
        <span>Print / PDF</span>
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
        <ExternalLink size={16} aria-hidden="true" />
      </a>
      <span className="toolbar-separator" aria-hidden="true" />
      <details ref={schemePickerRef} className={`scheme-picker ${actionClass(activeAction, "scheme")}`} aria-label="Color scheme">
        <summary
          ref={schemeSummaryRef}
          role="button"
          aria-haspopup="menu"
          title={`Color scheme: ${currentScheme.name}`}
          aria-label="Color scheme"
          onKeyDown={handleSchemeSummaryKeyDown}
        >
          <Palette size={16} aria-hidden="true" />
          <span>{currentScheme.name}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div ref={schemeMenuRef} className="scheme-menu" role="menu" aria-label="Color schemes" onKeyDown={handleSchemeMenuKeyDown}>
          {colorSchemes.map((scheme) => (
            <button
              key={scheme.id}
              type="button"
              role="menuitemradio"
              aria-checked={scheme.id === colorScheme}
              onClick={(event) => {
                onSelectColorScheme(scheme.id);
                closeSchemePicker(event.currentTarget, schemeSummaryRef.current);
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

function closeSchemePicker(target: HTMLElement, summary: HTMLElement | null): void {
  target.closest("details")?.removeAttribute("open");
  summary?.focus();
}

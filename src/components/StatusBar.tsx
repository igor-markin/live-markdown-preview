import { Check, FileText, Info, ListChecks, TriangleAlert } from "lucide-preact";
import type { RenderState, SaveState } from "../types";

type ConflictAction = null | "reload";

interface StatusBarProps {
  actionStatus: string;
  diagnosticsCount: number;
  pendingConflictAction: ConflictAction;
  renderDurationMs: number | null;
  renderMessage: string;
  renderState: RenderState;
  saveState: SaveState;
  wordCount: number;
  onCancelConflictReload: () => void;
  onConfirmConflictReload: () => void;
  onReloadConflictDraft: () => void;
  onOverwriteConflictDraft: () => void;
}

export function StatusBar({
  actionStatus,
  diagnosticsCount,
  pendingConflictAction,
  renderDurationMs,
  renderMessage,
  renderState,
  saveState,
  wordCount,
  onCancelConflictReload,
  onConfirmConflictReload,
  onReloadConflictDraft,
  onOverwriteConflictDraft
}: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className={`status-pill status-${saveState}`}>
        {saveState === "saved" && <Check size={14} aria-hidden="true" />}
        {saveState === "saving" && <span className="spinner" aria-hidden="true" />}
        {saveState === "unavailable" && <TriangleAlert size={14} aria-hidden="true" />}
        {saveState === "conflict" && <TriangleAlert size={14} aria-hidden="true" />}
        {saveStateLabel(saveState)}
      </span>
      {saveState === "conflict" && (
        <span className="status-actions">
          {pendingConflictAction === "reload" ? (
            <>
              <span>Reload remote draft?</span>
              <button type="button" onClick={onConfirmConflictReload}>
                Confirm reload
              </button>
              <button type="button" onClick={onCancelConflictReload}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onReloadConflictDraft}>
                Reload
              </button>
              <button type="button" onClick={onOverwriteConflictDraft}>
                Overwrite
              </button>
            </>
          )}
        </span>
      )}
      <span className={`status-pill status-${renderState}`}>
        {renderState === "rendering" && <span className="spinner" aria-hidden="true" />}
        {(renderState === "error" || renderState === "paused") && <TriangleAlert size={14} aria-hidden="true" />}
        {renderState === "ready" && <Check size={14} aria-hidden="true" />}
        {renderStateLabel(renderState, renderDurationMs, renderMessage)}
      </span>
      <span className="status-pill">
        <FileText size={14} aria-hidden="true" />
        {wordCount} words
      </span>
      {diagnosticsCount > 0 && (
        <span className="status-pill status-warning">
          <ListChecks size={14} aria-hidden="true" />
          {diagnosticsCount} diagnostics
        </span>
      )}
      {actionStatus && (
        <span className="status-pill action-status" role="status" aria-live="polite" aria-atomic="true">
          <Info size={14} aria-hidden="true" />
          {actionStatus}
        </span>
      )}
    </footer>
  );
}

function saveStateLabel(state: SaveState): string {
  if (state === "loading") {
    return "Loading";
  }

  if (state === "saving") {
    return "Saving";
  }

  if (state === "unavailable") {
    return "Not saved locally";
  }

  if (state === "conflict") {
    return "Draft changed in another tab";
  }

  return "Saved";
}

function renderStateLabel(state: RenderState, durationMs: number | null, message: string): string {
  if (state === "rendering") {
    return "Rendering";
  }

  if (state === "error") {
    return message || "Render error";
  }

  if (state === "paused") {
    return message || "Live preview paused";
  }

  return durationMs === null ? "Rendered" : `Rendered in ${durationMs} ms`;
}

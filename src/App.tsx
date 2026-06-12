import type { JSX } from "preact";
import { FileText, PanelLeft } from "lucide-preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { MarkdownEditorHandle } from "./components/MarkdownEditor";
import { Modal } from "./components/Modal";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { copyTextToClipboard } from "./clipboard";
import { DEFAULT_MARKDOWN, DEFAULT_PREFERENCES } from "./defaults";
import { useMarkdownRender } from "./hooks/useMarkdownRender";
import { getCopyableHtml } from "./markdown/previewHtml";
import { clampSplitRatio } from "./preferences";
import { createAppStorage, DraftConflictError, normalizeDraftRecord, type DraftRecord } from "./storage";
import type { MobileMode, Preferences, SaveState, Theme } from "./types";

type ModalState = null | "about";
type ConflictAction = null | "reload";
type MarkdownEditorComponent = typeof import("./components/MarkdownEditor").MarkdownEditor;

const ACTION_FEEDBACK_MS = 650;
const GITHUB_URL = "https://github.com/igor-markin/live-markdown-preview";
const DRAFT_CHANNEL_NAME = "live-markdown-preview:draft";

export function App() {
  const storageRef = useRef(createAppStorage());
  const loadedRef = useRef(false);
  const editorHandleRef = useRef<MarkdownEditorHandle | null>(null);
  const actionFeedbackTimeoutRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const clientIdRef = useRef(createClientId());
  const currentDraftRevisionRef = useRef(0);
  const remoteDraftRef = useRef<DraftRecord | null>(null);
  const skipNextAutosaveRef = useRef(false);
  const storageWritePausedRef = useRef(false);
  const markdownRef = useRef(DEFAULT_MARKDOWN);
  const saveStateRef = useRef<SaveState>("loading");
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const modalReturnFocusRef = useRef<HTMLElement | null>(null);

  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [EditorComponent, setEditorComponent] = useState<MarkdownEditorComponent | null>(null);
  const [theme, setTheme] = useState<Theme>(DEFAULT_PREFERENCES.theme);
  const [outlineVisible, setOutlineVisible] = useState(DEFAULT_PREFERENCES.outlineVisible);
  const [splitRatio, setSplitRatio] = useState(DEFAULT_PREFERENCES.splitRatio);
  const [mobileMode, setMobileMode] = useState<MobileMode>("editor");
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [editorLoadFailed, setEditorLoadFailed] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [pendingConflictAction, setPendingConflictAction] = useState<ConflictAction>(null);
  const [isResizing, setIsResizing] = useState(false);

  const wordCount = useMemo(() => countWords(markdown), [markdown]);

  const completeAction = useCallback((actionId: string, message: string) => {
    setActiveAction(actionId);
    setActionStatus(message);

    if (actionFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(actionFeedbackTimeoutRef.current);
    }

    actionFeedbackTimeoutRef.current = window.setTimeout(() => {
      setActiveAction(null);
      actionFeedbackTimeoutRef.current = null;
    }, ACTION_FEEDBACK_MS);
  }, []);

  const {
    diagnostics,
    headings,
    isPreviewFresh,
    previewHtml,
    renderDurationMs,
    renderMessage,
    renderState
  } = useMarkdownRender(markdown, completeAction);

  const closeModal = useCallback(() => {
    setModal(null);

    window.setTimeout(() => {
      modalReturnFocusRef.current?.focus();
      modalReturnFocusRef.current = null;
    }, 0);
  }, []);

  const setEditorHandle = useCallback((handle: MarkdownEditorHandle | null) => {
    editorHandleRef.current = handle;
  }, []);

  const handleMarkdownChange = useCallback((nextMarkdown: string) => {
    storageWritePausedRef.current = false;
    setMarkdown(nextMarkdown);
  }, []);

  const openModal = useCallback((nextModal: Exclude<ModalState, null>) => {
    modalReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setModal(nextModal);
  }, []);

  useEffect(() => {
    return () => {
      if (actionFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(actionFeedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    markdownRef.current = markdown;
  }, [markdown]);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    let cancelled = false;

    void import("./components/MarkdownEditor")
      .then((module) => {
        if (!cancelled) {
          setEditorComponent(() => module.MarkdownEditor);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEditorLoadFailed(true);
          completeAction("editor", "Editor unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [completeAction]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return undefined;
    }

    const channel = new BroadcastChannel(DRAFT_CHANNEL_NAME);
    broadcastRef.current = channel;

    channel.onmessage = (event: MessageEvent<unknown>) => {
      const record = parseDraftBroadcast(event.data);

      if (!record || record.clientId === clientIdRef.current || record.revision <= currentDraftRevisionRef.current) {
        return;
      }

      if (record.markdown === markdownRef.current) {
        currentDraftRevisionRef.current = record.revision;
        setPendingConflictAction(null);
        setSaveState("saved");
        return;
      }

      remoteDraftRef.current = record;
      setPendingConflictAction(null);
      setSaveState("conflict");
      completeAction("conflict", "Draft changed in another tab");
    };

    return () => {
      channel.close();
      broadcastRef.current = null;
    };
  }, [completeAction]);

  useEffect(() => {
    let cancelled = false;

    async function loadStoredState() {
      try {
        const [storedDraftRecord, storedPreferences] = await Promise.all([
          storageRef.current.loadDraftRecord(),
          storageRef.current.loadPreferences()
        ]);

        if (cancelled) {
          return;
        }

        if (storedDraftRecord !== null) {
          currentDraftRevisionRef.current = storedDraftRecord.revision;
          setMarkdown(storedDraftRecord.markdown);
        }

        setTheme(storedPreferences.theme);
        setOutlineVisible(storedPreferences.outlineVisible);
        setSplitRatio(storedPreferences.splitRatio);
        setSaveState("saved");
      } catch {
        if (!cancelled) {
          storageWritePausedRef.current = true;
          setSaveState("unavailable");
        }
      } finally {
        loadedRef.current = true;
      }
    }

    void loadStoredState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    if (!loadedRef.current) {
      return;
    }

    const preferences: Preferences = { theme, outlineVisible, splitRatio };
    void storageRef.current.savePreferences(preferences).catch(() => {
      storageWritePausedRef.current = true;
      setSaveState("unavailable");
    });
  }, [outlineVisible, splitRatio, theme]);

  useEffect(() => {
    if (
      !loadedRef.current ||
      storageWritePausedRef.current ||
      saveStateRef.current === "conflict"
    ) {
      return;
    }

    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    setSaveState("saving");

    const timeout = window.setTimeout(() => {
      void storageRef.current
        .saveDraftRecord(markdown, {
          clientId: clientIdRef.current,
          expectedRevision: currentDraftRevisionRef.current
        })
        .then((record) => {
          currentDraftRevisionRef.current = record.revision;
          broadcastDraft(record, broadcastRef.current);
          setSaveState("saved");
        })
        .catch((error: unknown) => {
          if (error instanceof DraftConflictError) {
            if (error.storedRecord?.markdown === markdownRef.current) {
              currentDraftRevisionRef.current = error.storedRecord.revision;
              remoteDraftRef.current = null;
              setPendingConflictAction(null);
              setSaveState("saved");
              return;
            }

            remoteDraftRef.current = error.storedRecord;
            setPendingConflictAction(null);
            setSaveState("conflict");
            completeAction("conflict", "Draft changed in another tab");
            return;
          }

          storageWritePausedRef.current = true;
          setSaveState("unavailable");
        });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [completeAction, markdown]);

  const copyMarkdown = useCallback(async () => {
    await runClipboardAction(
      () => copyTextToClipboard(markdown),
      completeAction,
      "copy-markdown",
      "Markdown copied"
    );
  }, [completeAction, markdown]);

  const undoEdit = useCallback(() => {
    const editor = editorHandleRef.current;

    if (editor?.undo()) {
      completeAction("undo", "Undone");
      editor.focus();
      return;
    }

    completeAction("undo", "Nothing to undo");
  }, [completeAction]);

  const redoEdit = useCallback(() => {
    const editor = editorHandleRef.current;

    if (editor?.redo()) {
      completeAction("redo", "Redone");
      editor.focus();
      return;
    }

    completeAction("redo", "Nothing to redo");
  }, [completeAction]);

  const copyHtml = useCallback(async () => {
    if (!isPreviewFresh("copy-html")) {
      return;
    }

    await runClipboardAction(
      () => copyTextToClipboard(getCopyableHtml(previewHtml)),
      completeAction,
      "copy-html",
      "HTML copied"
    );
  }, [completeAction, isPreviewFresh, previewHtml]);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "light" ? "dark" : "light";

    setTheme(nextTheme);
    completeAction("theme", nextTheme === "dark" ? "Dark theme" : "Light theme");
  }, [completeAction, theme]);

  const toggleOutline = useCallback(() => {
    const nextVisible = !outlineVisible;

    setOutlineVisible(nextVisible);
    completeAction("outline", nextVisible ? "Outline shown" : "Outline hidden");
  }, [completeAction, outlineVisible]);

  const openAbout = useCallback(() => {
    openModal("about");
    completeAction("about", "About opened");
  }, [completeAction, openModal]);

  const exportPdf = useCallback(() => {
    if (!isPreviewFresh("pdf")) {
      return;
    }

    try {
      window.print();
      completeAction("pdf", "Print dialog opened");
    } catch {
      completeAction("pdf", "Print unavailable");
    }
  }, [completeAction, isPreviewFresh]);

  const applyStoredDraft = useCallback((record: DraftRecord) => {
    currentDraftRevisionRef.current = record.revision;
    remoteDraftRef.current = null;
    storageWritePausedRef.current = false;
    skipNextAutosaveRef.current = true;
    setPendingConflictAction(null);
    setMarkdown(record.markdown);
    setSaveState("saved");
  }, []);

  const reloadConflictDraft = useCallback(async () => {
    try {
      const record = remoteDraftRef.current ?? (await storageRef.current.loadDraftRecord());

      if (!record) {
        remoteDraftRef.current = null;
        setPendingConflictAction(null);
        setSaveState("saved");
        completeAction("reload", "No remote draft");
        return;
      }

      remoteDraftRef.current = record;

      if (markdownRef.current !== record.markdown) {
        setPendingConflictAction("reload");
        completeAction("reload", "Confirm reload");
        return;
      }

      applyStoredDraft(record);
      completeAction("reload", "Draft reloaded");
    } catch {
      storageWritePausedRef.current = true;
      setSaveState("unavailable");
    }
  }, [applyStoredDraft, completeAction]);

  const confirmConflictReload = useCallback(() => {
    const record = remoteDraftRef.current;

    if (!record) {
      setPendingConflictAction(null);
      completeAction("reload", "No remote draft");
      return;
    }

    applyStoredDraft(record);
    completeAction("reload", "Draft reloaded");
  }, [applyStoredDraft, completeAction]);

  const cancelConflictReload = useCallback(() => {
    setPendingConflictAction(null);
    completeAction("reload", "Reload cancelled");
  }, [completeAction]);

  const overwriteConflictDraft = useCallback(async () => {
    setSaveState("saving");
    storageWritePausedRef.current = false;

    try {
      const record = await storageRef.current.saveDraftRecord(markdownRef.current, {
        clientId: clientIdRef.current,
        expectedRevision: currentDraftRevisionRef.current,
        overwrite: true
      });

      currentDraftRevisionRef.current = record.revision;
      remoteDraftRef.current = null;
      setPendingConflictAction(null);
      setSaveState("saved");
      broadcastDraft(record, broadcastRef.current);
      completeAction("overwrite", "Draft overwritten");
    } catch {
      storageWritePausedRef.current = true;
      setSaveState("unavailable");
    }
  }, [completeAction]);

  const updateSplitRatioFromClientX = useCallback((clientX: number) => {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const rect = workspace.getBoundingClientRect();
    const rawRatio = ((clientX - rect.left) / rect.width) * 100;

    setSplitRatio(clampSplitRatio(rawRatio));
  }, []);

  const beginSplitDrag = useCallback(
    (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      setIsResizing(true);
      updateSplitRatioFromClientX(event.clientX);

      const onPointerMove = (moveEvent: PointerEvent) => {
        updateSplitRatioFromClientX(moveEvent.clientX);
      };
      const endPointerDrag = () => {
        setIsResizing(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", endPointerDrag);
        window.removeEventListener("pointercancel", endPointerDrag);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endPointerDrag);
      window.addEventListener("pointercancel", endPointerDrag);
    },
    [updateSplitRatioFromClientX]
  );

  const handleSplitterKeyDown = useCallback((event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplitRatio((current) => clampSplitRatio(current - 2));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplitRatio((current) => clampSplitRatio(current + 2));
    }
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Live Markdown Preview">
          <FileText size={20} aria-hidden="true" />
          <span>Live Markdown Preview</span>
        </div>

        <div className="mobile-tabs" role="tablist" aria-label="Mobile view">
          <button
            type="button"
            className={mobileMode === "editor" ? "is-active" : ""}
            onClick={() => setMobileMode("editor")}
            aria-pressed={mobileMode === "editor"}
          >
            <PanelLeft size={16} aria-hidden="true" />
            Editor
          </button>
          <button
            type="button"
            className={mobileMode === "preview" ? "is-active" : ""}
            onClick={() => setMobileMode("preview")}
            aria-pressed={mobileMode === "preview"}
          >
            <FileText size={16} aria-hidden="true" />
            Preview
          </button>
        </div>

        <Toolbar
          activeAction={activeAction}
          githubUrl={GITHUB_URL}
          outlineVisible={outlineVisible}
          theme={theme}
          onCopyHtml={copyHtml}
          onCopyMarkdown={copyMarkdown}
          onExportPdf={exportPdf}
          onOpenAbout={openAbout}
          onRedo={redoEdit}
          onToggleOutline={toggleOutline}
          onToggleTheme={toggleTheme}
          onUndo={undoEdit}
        />
      </header>

      <main
        ref={workspaceRef}
        className={`workspace mode-${mobileMode} split-${splitRatio}${isResizing ? " is-resizing" : ""}`}
      >
        <section className={`pane editor-pane${outlineVisible ? "" : " outline-hidden"}`} aria-label="Markdown editor">
          {outlineVisible && (
            <aside className="outline" aria-label="Document outline">
              <div className="outline-title">Outline</div>
              {headings.length > 0 ? (
                <ol>
                  {headings.map((heading) => (
                    <li key={`${heading.id}-${heading.line}`} className={`outline-level-${heading.level}`}>
                      <a href={`#${heading.id}`}>{heading.text || "Untitled"}</a>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No headings</p>
              )}
            </aside>
          )}

          <div className="editor-shell">
            {EditorComponent ? (
              <EditorComponent value={markdown} onChange={handleMarkdownChange} onEditorReady={setEditorHandle} />
            ) : (
              <div className="editor-host editor-loading" role="status" aria-live="polite" aria-busy={!editorLoadFailed}>
                {editorLoadFailed ? "Editor unavailable" : "Loading editor"}
              </div>
            )}
          </div>
        </section>

        <div
          className="splitter"
          role="separator"
          aria-label="Resize Markdown and Preview panes"
          aria-orientation="vertical"
          aria-valuemin={30}
          aria-valuemax={70}
          aria-valuenow={splitRatio}
          tabIndex={0}
          onPointerDown={beginSplitDrag}
          onKeyDown={handleSplitterKeyDown}
        />

        <section className="pane preview-pane" aria-label="Markdown preview">
          <div className="preview-scroll">
            <article className="markdown-preview" dangerouslySetInnerHTML={{ __html: previewHtml.safeHtml }} />
          </div>
        </section>
      </main>

      <StatusBar
        actionStatus={actionStatus}
        diagnosticsCount={diagnostics.length}
        pendingConflictAction={pendingConflictAction}
        renderDurationMs={renderDurationMs}
        renderMessage={renderMessage}
        renderState={renderState}
        saveState={saveState}
        wordCount={wordCount}
        onCancelConflictReload={cancelConflictReload}
        onConfirmConflictReload={confirmConflictReload}
        onReloadConflictDraft={reloadConflictDraft}
        onOverwriteConflictDraft={overwriteConflictDraft}
      />

      {modal === "about" && (
        <Modal title="About" onClose={closeModal}>
          <p>
            Live Markdown Preview is a local-first Markdown editor with safe live preview,
            and print-based PDF export.
          </p>
          <p>Author: Igor Markin</p>
          <p>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub repository
            </a>
          </p>
        </Modal>
      )}
    </div>
  );
}

async function runClipboardAction(
  action: () => Promise<void>,
  completeAction: (actionId: string, message: string) => void,
  actionId: string,
  successMessage: string
): Promise<void> {
  try {
    await action();
    completeAction(actionId, successMessage);
  } catch {
    completeAction(actionId, "Clipboard unavailable");
  }
}

function countWords(markdown: string): number {
  const words = markdown.trim().match(/\S+/g);

  return words?.length ?? 0;
}

function createClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function broadcastDraft(record: DraftRecord, channel: BroadcastChannel | null): void {
  try {
    channel?.postMessage({ type: "draft-saved", record });
  } catch {
    // BroadcastChannel is a best-effort early conflict signal; IndexedDB CAS is the source of truth.
  }
}

function parseDraftBroadcast(value: unknown): DraftRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as { type?: unknown; record?: unknown };

  if (message.type !== "draft-saved") {
    return null;
  }

  return normalizeDraftRecord(message.record);
}

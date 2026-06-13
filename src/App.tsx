import type { JSX } from "preact";
import {
  Check,
  Columns2,
  Eye,
  FileText,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  X
} from "lucide-preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { MarkdownEditorHandle } from "./components/MarkdownEditor";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { copyTextToClipboard } from "./clipboard";
import { DEFAULT_MARKDOWN, DEFAULT_PREFERENCES } from "./defaults";
import { useMarkdownRender } from "./hooks/useMarkdownRender";
import { getCopyableHtml } from "./markdown/previewHtml";
import { clampSplitRatio } from "./preferences";
import {
  createAppStorage,
  DraftConflictError,
  normalizeFileRecord,
  StorageUnavailableError,
  type FileRecord
} from "./storage";
import type { Preferences, SaveState, Theme, ViewMode } from "./types";

type ConflictAction = null | "reload";
type MarkdownEditorComponent = typeof import("./components/MarkdownEditor").MarkdownEditor;
type PendingSave = {
  fileId: string;
  markdown: string;
  expectedRevision: number;
};

const ACTION_FEEDBACK_MS = 650;
const AUTOSAVE_DELAY_MS = 300;
const SPLIT_INDICATOR_MS = 900;
const GITHUB_URL = "https://github.com/igor-markin/live-markdown-preview";
const DRAFT_CHANNEL_NAME = "live-markdown-preview:draft";

export function App() {
  const storageRef = useRef(createAppStorage());
  const loadedRef = useRef(false);
  const editorHandleRef = useRef<MarkdownEditorHandle | null>(null);
  const actionFeedbackTimeoutRef = useRef<number | null>(null);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const splitIndicatorTimeoutRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const helpDialogRef = useRef<HTMLDialogElement | null>(null);
  const helpCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const clientIdRef = useRef(createClientId());
  const currentFileRevisionRef = useRef(0);
  const fileRevisionsRef = useRef<Map<string, number>>(new Map());
  const activeFileIdRef = useRef<string | null>(null);
  const remoteFileRef = useRef<FileRecord | null>(null);
  const storageWritePausedRef = useRef(false);
  const markdownRef = useRef(DEFAULT_MARKDOWN);
  const saveStateRef = useRef<SaveState>("loading");
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const pendingSavesRef = useRef<Map<string, PendingSave>>(new Map());
  const inFlightSaveRef = useRef<PendingSave | null>(null);
  const flushPendingSaveRef = useRef<() => void>(() => undefined);

  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [EditorComponent, setEditorComponent] = useState<MarkdownEditorComponent | null>(null);
  const [theme, setTheme] = useState<Theme>(DEFAULT_PREFERENCES.theme);
  const [outlineVisible, setOutlineVisible] = useState(DEFAULT_PREFERENCES.outlineVisible);
  const [splitRatio, setSplitRatio] = useState(DEFAULT_PREFERENCES.splitRatio);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [editorLoadFailed, setEditorLoadFailed] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const [pendingConflictAction, setPendingConflictAction] = useState<ConflictAction>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [splitIndicatorVisible, setSplitIndicatorVisible] = useState(false);

  const effectiveViewMode = isMobileViewport && viewMode === "split" ? "markdown" : viewMode;
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

  const appendTechnicalError = useCallback(
    (type: string, message: string, source?: string) => {
      void storageRef.current
        .appendErrorLog({ type, message, source })
        .catch(() => {
          // The diagnostic log is best-effort and must not create more user-visible failures.
        });
    },
    []
  );

  const captureStorageError = useCallback(
    (error: unknown, source: string) => {
      appendTechnicalError(
        error instanceof StorageUnavailableError && error.reason === "timeout" ? "storage timeout" : "storage unavailable",
        getErrorMessage(error, "Storage unavailable"),
        source
      );
    },
    [appendTechnicalError]
  );

  const upsertFile = useCallback((record: FileRecord) => {
    fileRevisionsRef.current.set(record.id, record.revision);
    setFiles((currentFiles) => {
      const index = currentFiles.findIndex((file) => file.id === record.id);

      if (index === -1) {
        return [...currentFiles, record];
      }

      const nextFiles = [...currentFiles];
      nextFiles[index] = record;

      return nextFiles;
    });
  }, []);

  const applyActiveFile = useCallback(
    (record: FileRecord) => {
      activeFileIdRef.current = record.id;
      currentFileRevisionRef.current = record.revision;
      fileRevisionsRef.current.set(record.id, record.revision);
      remoteFileRef.current = null;
      storageWritePausedRef.current = false;
      markdownRef.current = record.markdown;

      setActiveFileId(record.id);
      setPendingConflictAction(null);
      setMarkdown(record.markdown);
      setSaveState("saved");
      upsertFile(record);
    },
    [upsertFile]
  );

  const flushPendingSave = useCallback(() => {
    if (inFlightSaveRef.current || storageWritePausedRef.current || saveStateRef.current === "conflict") {
      return;
    }

    const pendingSave = takePendingSave(pendingSavesRef.current, activeFileIdRef.current);

    if (!pendingSave) {
      return;
    }

    inFlightSaveRef.current = pendingSave;

    void storageRef.current
      .saveFileRecord(pendingSave.fileId, pendingSave.markdown, {
        clientId: clientIdRef.current,
        expectedRevision: pendingSave.expectedRevision
      })
      .then((record) => {
        const completedSave = inFlightSaveRef.current;
        inFlightSaveRef.current = null;

        if (!completedSave || completedSave.fileId !== record.id) {
          flushPendingSaveRef.current();
          return;
        }

        fileRevisionsRef.current.set(record.id, record.revision);
        upsertFile(record);
        broadcastFile(record, broadcastRef.current);

        const queuedSave = pendingSavesRef.current.get(record.id);

        if (queuedSave) {
          pendingSavesRef.current.set(record.id, {
            ...queuedSave,
            expectedRevision: record.revision
          });
        }

        if (activeFileIdRef.current === record.id) {
          currentFileRevisionRef.current = record.revision;

          if (markdownRef.current === record.markdown && !pendingSavesRef.current.has(record.id)) {
            setPendingConflictAction(null);
            setSaveState("saved");
          } else {
            setSaveState("saving");
          }
        }

        flushPendingSaveRef.current();
      })
      .catch((error: unknown) => {
        const failedSave = inFlightSaveRef.current;
        inFlightSaveRef.current = null;

        if (!failedSave) {
          flushPendingSaveRef.current();
          return;
        }

        if (error instanceof DraftConflictError) {
          const storedRecord = error.storedRecord;

          if (storedRecord) {
            fileRevisionsRef.current.set(storedRecord.id, storedRecord.revision);
            upsertFile(storedRecord);

            const queuedSave = pendingSavesRef.current.get(storedRecord.id);

            if (queuedSave) {
              pendingSavesRef.current.set(storedRecord.id, {
                ...queuedSave,
                expectedRevision: storedRecord.revision
              });
            }
          }

          if (activeFileIdRef.current !== failedSave.fileId) {
            flushPendingSaveRef.current();
            return;
          }

          if (storedRecord?.markdown === markdownRef.current) {
            currentFileRevisionRef.current = storedRecord.revision;
            remoteFileRef.current = null;
            setPendingConflictAction(null);
            setSaveState("saved");
            flushPendingSaveRef.current();
            return;
          }

          remoteFileRef.current = storedRecord;
          setPendingConflictAction(null);
          setSaveState("conflict");
          completeAction("conflict", "Draft changed in another tab");
          return;
        }

        captureStorageError(error, "autosave");
        storageWritePausedRef.current = true;
        pendingSavesRef.current.clear();
        setSaveState("unavailable");
      });
  }, [captureStorageError, completeAction, upsertFile]);

  flushPendingSaveRef.current = flushPendingSave;

  const scheduleAutosave = useCallback((fileId: string, nextMarkdown: string) => {
    if (!loadedRef.current || storageWritePausedRef.current || saveStateRef.current === "conflict") {
      return;
    }

    const expectedRevision = fileRevisionsRef.current.get(fileId) ?? currentFileRevisionRef.current;

    pendingSavesRef.current.set(fileId, {
      fileId,
      markdown: nextMarkdown,
      expectedRevision
    });
    setSaveState("saving");

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null;
      flushPendingSaveRef.current();
    }, AUTOSAVE_DELAY_MS);
  }, []);

  const queueCurrentFileSave = useCallback(() => {
    const currentFileId = activeFileIdRef.current;

    if (!currentFileId) {
      return;
    }

    scheduleAutosave(currentFileId, markdownRef.current);
  }, [scheduleAutosave]);

  const setEditorHandle = useCallback((handle: MarkdownEditorHandle | null) => {
    editorHandleRef.current = handle;
  }, []);

  const handleMarkdownChange = useCallback(
    (nextMarkdown: string) => {
      markdownRef.current = nextMarkdown;
      setMarkdown(nextMarkdown);

      storageWritePausedRef.current = false;

      const currentFileId = activeFileIdRef.current;

      if (currentFileId) {
        scheduleAutosave(currentFileId, nextMarkdown);
      }
    },
    [scheduleAutosave]
  );

  const showSplitIndicatorBriefly = useCallback(() => {
    setSplitIndicatorVisible(true);

    if (splitIndicatorTimeoutRef.current !== null) {
      window.clearTimeout(splitIndicatorTimeoutRef.current);
    }

    splitIndicatorTimeoutRef.current = window.setTimeout(() => {
      setSplitIndicatorVisible(false);
      splitIndicatorTimeoutRef.current = null;
    }, SPLIT_INDICATOR_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (actionFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(actionFeedbackTimeoutRef.current);
      }

      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
      }

      if (splitIndicatorTimeoutRef.current !== null) {
        window.clearTimeout(splitIndicatorTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 920px)");
    const syncViewportMode = () => {
      setIsMobileViewport(mediaQuery.matches);
    };

    syncViewportMode();
    mediaQuery.addEventListener("change", syncViewportMode);

    return () => {
      mediaQuery.removeEventListener("change", syncViewportMode);
    };
  }, []);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      appendTechnicalError("window error", event.message || "Window error", event.filename || "window");
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendTechnicalError("unhandledrejection", getErrorMessage(event.reason, "Unhandled promise rejection"), "promise");
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [appendTechnicalError]);

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
      const record = parseFileBroadcast(event.data);

      if (!record || record.clientId === clientIdRef.current) {
        return;
      }

      upsertFile(record);

      if (record.id !== activeFileIdRef.current || record.revision <= currentFileRevisionRef.current) {
        return;
      }

      if (record.markdown === markdownRef.current) {
        currentFileRevisionRef.current = record.revision;
        fileRevisionsRef.current.set(record.id, record.revision);
        setPendingConflictAction(null);
        setSaveState("saved");
        return;
      }

      remoteFileRef.current = record;
      setPendingConflictAction(null);
      setSaveState("conflict");
      completeAction("conflict", "Draft changed in another tab");
    };

    return () => {
      channel.close();
      broadcastRef.current = null;
    };
  }, [completeAction, upsertFile]);

  const closeHelp = useCallback(() => {
    setIsHelpOpen(false);
    completeAction("help", "Help closed");
  }, [completeAction]);

  const openHelp = useCallback(() => {
    setIsHelpOpen(true);
    completeAction("help", "Help opened");
  }, [completeAction]);

  useEffect(() => {
    if (!isHelpOpen) {
      return undefined;
    }

    const dialog = helpDialogRef.current;

    if (!dialog) {
      return undefined;
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    helpCloseButtonRef.current?.focus();

    const handleCancel = (event: Event) => {
      event.preventDefault();
      closeHelp();
    };

    dialog.addEventListener("cancel", handleCancel);

    return () => {
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, [closeHelp, isHelpOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadStoredState() {
      try {
        const [storedWorkspace, storedPreferences] = await Promise.all([
          storageRef.current.loadWorkspace(DEFAULT_MARKDOWN),
          storageRef.current.loadPreferences()
        ]);

        if (cancelled) {
          return;
        }

        fileRevisionsRef.current = new Map(storedWorkspace.files.map((file) => [file.id, file.revision]));
        activeFileIdRef.current = storedWorkspace.activeFileId;
        currentFileRevisionRef.current = storedWorkspace.activeFile.revision;
        markdownRef.current = storedWorkspace.activeFile.markdown;

        setFiles(storedWorkspace.files);
        setActiveFileId(storedWorkspace.activeFileId);
        setMarkdown(storedWorkspace.activeFile.markdown);
        setTheme(storedPreferences.theme);
        setOutlineVisible(storedPreferences.outlineVisible);
        setSplitRatio(storedPreferences.splitRatio);
        setSaveState("saved");
      } catch (error) {
        if (!cancelled) {
          captureStorageError(error, "load workspace");
          storageWritePausedRef.current = true;
          setSaveState("unavailable");
        }
      } finally {
        if (!cancelled) {
          loadedRef.current = true;
        }
      }
    }

    void loadStoredState();

    return () => {
      cancelled = true;
    };
  }, [captureStorageError]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    if (!loadedRef.current) {
      return;
    }

    const preferences: Preferences = { theme, outlineVisible, splitRatio };
    void storageRef.current.savePreferences(preferences).catch((error: unknown) => {
      captureStorageError(error, "save preferences");
      storageWritePausedRef.current = true;
      setSaveState("unavailable");
    });
  }, [captureStorageError, outlineVisible, splitRatio, theme]);

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

  const switchActiveFile = useCallback(
    async (fileId: string) => {
      if (!fileId || fileId === activeFileIdRef.current) {
        return;
      }

      queueCurrentFileSave();
      setSaveState("loading");

      try {
        const record = await storageRef.current.setActiveFile(fileId);

        applyActiveFile(record);
        completeAction("file", "File opened");
      } catch (error) {
        captureStorageError(error, "switch file");
        storageWritePausedRef.current = true;
        setSaveState("unavailable");
      }
    },
    [applyActiveFile, captureStorageError, completeAction, queueCurrentFileSave]
  );

  const createNewFile = useCallback(async () => {
    queueCurrentFileSave();
    setSaveState("loading");

    try {
      const record = await storageRef.current.createFile(DEFAULT_MARKDOWN, `New file ${files.length + 1}`);

      applyActiveFile(record);
      completeAction("file", "New file created");
    } catch (error) {
      captureStorageError(error, "create file");
      storageWritePausedRef.current = true;
      setSaveState("unavailable");
    }
  }, [applyActiveFile, captureStorageError, completeAction, files.length, queueCurrentFileSave]);

  const deleteFile = useCallback(
    async (fileId: string) => {
      const deletingActiveFile = fileId === activeFileIdRef.current;
      const previousSaveState = saveStateRef.current;

      if (renamingFileId === fileId) {
        setRenamingFileId(null);
        setRenameDraft("");
      }

      if (!deletingActiveFile) {
        queueCurrentFileSave();
      }

      pendingSavesRef.current.delete(fileId);

      if (inFlightSaveRef.current?.fileId === fileId) {
        inFlightSaveRef.current = null;
      }

      if (deletingActiveFile) {
        setSaveState("loading");
      }

      try {
        const workspace = await storageRef.current.deleteFile(fileId, DEFAULT_MARKDOWN);

        fileRevisionsRef.current = new Map(workspace.files.map((file) => [file.id, file.revision]));
        setFiles(workspace.files);

        if (deletingActiveFile || workspace.activeFileId !== activeFileIdRef.current) {
          applyActiveFile(workspace.activeFile);
        } else {
          setActiveFileId(workspace.activeFileId);
          setSaveState(previousSaveState === "loading" ? "saved" : previousSaveState);
        }

        completeAction("file", "File removed");
      } catch (error) {
        captureStorageError(error, "delete file");
        storageWritePausedRef.current = true;
        setSaveState("unavailable");
      }
    },
    [applyActiveFile, captureStorageError, completeAction, queueCurrentFileSave, renamingFileId]
  );

  const beginRenameFile = useCallback((file: FileRecord) => {
    setRenamingFileId(file.id);
    setRenameDraft(file.title);
  }, []);

  const cancelRenameFile = useCallback(() => {
    setRenamingFileId(null);
    setRenameDraft("");
  }, []);

  const commitRenameFile = useCallback(
    async (fileId: string) => {
      try {
        const record = await storageRef.current.renameFile(fileId, renameDraft);

        upsertFile(record);
        setRenamingFileId(null);
        setRenameDraft("");
        completeAction("rename", "File renamed");
      } catch (error) {
        captureStorageError(error, "rename file");
        storageWritePausedRef.current = true;
        setSaveState("unavailable");
      }
    },
    [captureStorageError, completeAction, renameDraft, upsertFile]
  );

  const handleRenameKeyDown = useCallback(
    (event: JSX.TargetedKeyboardEvent<HTMLInputElement>, fileId: string) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void commitRenameFile(fileId);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancelRenameFile();
      }
    },
    [cancelRenameFile, commitRenameFile]
  );

  const toggleSidebar = useCallback(() => {
    setOutlineVisible((current) => {
      const nextVisible = !current;

      completeAction("sidebar", nextVisible ? "Sidebar shown" : "Sidebar hidden");
      return nextVisible;
    });
  }, [completeAction]);

  const chooseViewMode = useCallback(
    (nextViewMode: ViewMode) => {
      setViewMode(nextViewMode);
      completeAction("view", `${viewModeLabel(nextViewMode)} view`);
    },
    [completeAction]
  );

  const reloadConflictDraft = useCallback(async () => {
    const currentFileId = activeFileIdRef.current;

    if (!currentFileId) {
      setPendingConflictAction(null);
      setSaveState("saved");
      completeAction("reload", "No remote draft");
      return;
    }

    try {
      const record = remoteFileRef.current ?? (await storageRef.current.loadFileRecord(currentFileId));

      if (!record || record.id !== currentFileId) {
        remoteFileRef.current = null;
        setPendingConflictAction(null);
        setSaveState("saved");
        completeAction("reload", "No remote draft");
        return;
      }

      remoteFileRef.current = record;

      if (markdownRef.current !== record.markdown) {
        setPendingConflictAction("reload");
        completeAction("reload", "Confirm reload");
        return;
      }

      applyActiveFile(record);
      completeAction("reload", "Draft reloaded");
    } catch (error) {
      captureStorageError(error, "reload conflict");
      storageWritePausedRef.current = true;
      setSaveState("unavailable");
    }
  }, [applyActiveFile, captureStorageError, completeAction]);

  const confirmConflictReload = useCallback(() => {
    const record = remoteFileRef.current;

    if (!record) {
      setPendingConflictAction(null);
      completeAction("reload", "No remote draft");
      return;
    }

    applyActiveFile(record);
    completeAction("reload", "Draft reloaded");
  }, [applyActiveFile, completeAction]);

  const cancelConflictReload = useCallback(() => {
    setPendingConflictAction(null);
    completeAction("reload", "Reload cancelled");
  }, [completeAction]);

  const overwriteConflictDraft = useCallback(async () => {
    const currentFileId = activeFileIdRef.current;

    if (!currentFileId) {
      setSaveState("unavailable");
      return;
    }

    pendingSavesRef.current.delete(currentFileId);
    setSaveState("saving");
    storageWritePausedRef.current = false;

    try {
      const record = await storageRef.current.saveFileRecord(currentFileId, markdownRef.current, {
        clientId: clientIdRef.current,
        expectedRevision: currentFileRevisionRef.current,
        overwrite: true
      });

      currentFileRevisionRef.current = record.revision;
      fileRevisionsRef.current.set(record.id, record.revision);
      remoteFileRef.current = null;
      setPendingConflictAction(null);
      setSaveState("saved");
      upsertFile(record);
      broadcastFile(record, broadcastRef.current);
      completeAction("overwrite", "Draft overwritten");
    } catch (error) {
      captureStorageError(error, "overwrite conflict");
      storageWritePausedRef.current = true;
      setSaveState("unavailable");
    }
  }, [captureStorageError, completeAction, upsertFile]);

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
      setSplitIndicatorVisible(true);
      updateSplitRatioFromClientX(event.clientX);

      const onPointerMove = (moveEvent: PointerEvent) => {
        updateSplitRatioFromClientX(moveEvent.clientX);
      };
      const endPointerDrag = () => {
        setIsResizing(false);
        setSplitIndicatorVisible(false);
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

  const handleSplitterKeyDown = useCallback(
    (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSplitRatio((current) => clampSplitRatio(current - 2));
        showSplitIndicatorBriefly();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setSplitRatio((current) => clampSplitRatio(current + 2));
        showSplitIndicatorBriefly();
      }
    },
    [showSplitIndicatorBriefly]
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Live Markdown Preview">
          <FileText size={20} aria-hidden="true" />
          <span>Live Markdown Preview</span>
        </div>

        <div className="topbar-controls" aria-label="Editor controls">
          <button
            type="button"
            className={activeAction === "undo" ? "is-action-complete" : ""}
            onClick={undoEdit}
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={activeAction === "redo" ? "is-action-complete" : ""}
            onClick={redoEdit}
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 size={16} aria-hidden="true" />
          </button>
          <span className="topbar-divider" aria-hidden="true" />
          <button
            type="button"
            className={`${outlineVisible ? "is-active" : ""}${activeAction === "sidebar" ? " is-action-complete" : ""}`}
            onClick={toggleSidebar}
            title={outlineVisible ? "Hide sidebar" : "Show sidebar"}
            aria-label={outlineVisible ? "Hide sidebar" : "Show sidebar"}
            aria-pressed={outlineVisible}
          >
            {outlineVisible ? <PanelLeftClose size={16} aria-hidden="true" /> : <PanelLeft size={16} aria-hidden="true" />}
          </button>

          <div className="view-switcher" role="group" aria-label="View mode" data-view-mode={effectiveViewMode}>
            <button
              type="button"
              className={`view-mode-markdown${effectiveViewMode === "markdown" ? " is-active" : ""}`}
              onClick={() => chooseViewMode("markdown")}
              aria-label="Markdown"
              aria-pressed={effectiveViewMode === "markdown"}
            >
              <PanelLeft size={16} aria-hidden="true" />
              <span>Markdown</span>
            </button>
            <button
              type="button"
              className={`view-mode-split${effectiveViewMode === "split" ? " is-active" : ""}`}
              onClick={() => chooseViewMode("split")}
              aria-label="Split"
              aria-pressed={effectiveViewMode === "split"}
            >
              <Columns2 size={16} aria-hidden="true" />
              <span>Split</span>
            </button>
            <button
              type="button"
              className={`view-mode-preview${effectiveViewMode === "preview" ? " is-active" : ""}`}
              onClick={() => chooseViewMode("preview")}
              aria-label="Preview"
              aria-pressed={effectiveViewMode === "preview"}
            >
              <Eye size={16} aria-hidden="true" />
              <span>Preview</span>
            </button>
          </div>
        </div>

        <Toolbar
          activeAction={activeAction}
          githubUrl={GITHUB_URL}
          theme={theme}
          onCopyHtml={copyHtml}
          onCopyMarkdown={copyMarkdown}
          onExportPdf={exportPdf}
          onOpenHelp={openHelp}
          onToggleTheme={toggleTheme}
        />
      </header>

      <main
        ref={workspaceRef}
        className={`workspace mode-${effectiveViewMode} split-${splitRatio}${isResizing ? " is-resizing" : ""}`}
      >
        <section className={`pane editor-pane${outlineVisible ? "" : " outline-hidden"}`} aria-label="Markdown editor">
          {outlineVisible && (
            <aside className="workspace-sidebar" aria-label="File manager and document outline">
              <section className="sidebar-section file-manager-panel" aria-label="Files">
                <div className="sidebar-title-row">
                  <div className="outline-title">Files</div>
                  <button type="button" className="sidebar-icon-button" onClick={createNewFile} title="New file" aria-label="New file">
                    <Plus size={15} aria-hidden="true" />
                  </button>
                </div>

                <ol className="file-list">
                  {files.length === 0 ? (
                    <li className="file-list-empty">Loading file</li>
                  ) : (
                    files.map((file) => (
                      <li
                        key={file.id}
                        className={`${file.id === activeFileId ? "is-active" : ""}${renamingFileId === file.id ? " is-renaming" : ""}`}
                      >
                        {renamingFileId === file.id ? (
                          <form
                            className="file-rename-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void commitRenameFile(file.id);
                            }}
                          >
                            <input
                              type="text"
                              value={renameDraft}
                              autoFocus
                              aria-label={`Rename ${file.title}`}
                              onInput={(event) => setRenameDraft(event.currentTarget.value)}
                              onKeyDown={(event) => handleRenameKeyDown(event, file.id)}
                            />
                            <button type="submit" title="Save file name" aria-label="Save file name">
                              <Check size={14} aria-hidden="true" />
                            </button>
                            <button type="button" onClick={cancelRenameFile} title="Cancel rename" aria-label="Cancel rename">
                              <X size={14} aria-hidden="true" />
                            </button>
                          </form>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="file-list-button"
                              onClick={() => void switchActiveFile(file.id)}
                              onDblClick={() => beginRenameFile(file)}
                              aria-pressed={file.id === activeFileId}
                              title={file.title}
                            >
                              <FileText size={15} aria-hidden="true" />
                              <span>{file.title}</span>
                            </button>
                            <button
                              type="button"
                              className="file-delete-button"
                              onClick={() => void deleteFile(file.id)}
                              title={`Delete ${file.title}`}
                              aria-label={`Delete ${file.title}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </li>
                    ))
                  )}
                </ol>
              </section>

              <section className="sidebar-section outline" aria-label="Document outline">
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
              </section>
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
        >
          {(isResizing || splitIndicatorVisible) && (
            <span className="split-ratio-indicator" role="status" aria-live="polite">
              {splitRatio}% / {100 - splitRatio}%
            </span>
          )}
        </div>

        <section className="pane preview-pane" aria-label="Markdown preview">
          <div className="preview-scroll">
            <article className="markdown-preview" dangerouslySetInnerHTML={{ __html: previewHtml.safeHtml }} />
          </div>
        </section>
      </main>

      {isHelpOpen && <HelpDialog closeButtonRef={helpCloseButtonRef} dialogRef={helpDialogRef} onClose={closeHelp} />}

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
    </div>
  );
}

interface HelpDialogProps {
  closeButtonRef: { current: HTMLButtonElement | null };
  dialogRef: { current: HTMLDialogElement | null };
  onClose: () => void;
}

function HelpDialog({ closeButtonRef, dialogRef, onClose }: HelpDialogProps) {
  return (
    <dialog
      ref={dialogRef}
      className="help-dialog"
      aria-labelledby="help-title"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const clickedBackdrop =
          event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;

        if (clickedBackdrop) {
          onClose();
        }
      }}
    >
      <header className="help-dialog-header">
        <h2 id="help-title">Help</h2>
        <button ref={closeButtonRef} type="button" onClick={onClose} title="Close help" aria-label="Close help">
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="help-dialog-body">
        <section className="help-section" aria-labelledby="help-guide-title">
          <h3 id="help-guide-title">Guide</h3>
          <ol>
            <li>Write Markdown in the editor and read the rendered preview beside it.</li>
            <li>Use the file sidebar to create drafts, switch files, rename them, or remove old ones.</li>
            <li>Copy Markdown or sanitized HTML when the preview is fresh, then export PDF from the preview.</li>
          </ol>
        </section>

        <section className="help-section" aria-labelledby="help-shortcuts-title">
          <h3 id="help-shortcuts-title">Shortcuts</h3>
          <dl className="shortcut-list">
            <div>
              <dt>Undo</dt>
              <dd>
                <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd>
              </dd>
            </div>
            <div>
              <dt>Redo</dt>
              <dd>
                <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd>
              </dd>
            </div>
            <div>
              <dt>Save file name</dt>
              <dd>
                <kbd>Enter</kbd>
              </dd>
            </div>
          </dl>
        </section>

        <section className="help-section" aria-labelledby="help-features-title">
          <h3 id="help-features-title">Features</h3>
          <ul>
            <li>Local autosave with draft conflict detection across tabs.</li>
            <li>Split, Markdown-only, and Preview-only modes with a resizable desktop split.</li>
            <li>Large document protection, safe link handling, and sanitized HTML export.</li>
          </ul>
        </section>
      </div>
    </dialog>
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

function takePendingSave(pendingSaves: Map<string, PendingSave>, activeFileId: string | null): PendingSave | null {
  const activeSave = activeFileId ? pendingSaves.get(activeFileId) : undefined;

  if (activeSave) {
    pendingSaves.delete(activeSave.fileId);
    return activeSave;
  }

  const nextSave = pendingSaves.values().next().value as PendingSave | undefined;

  if (!nextSave) {
    return null;
  }

  pendingSaves.delete(nextSave.fileId);
  return nextSave;
}

function broadcastFile(record: FileRecord, channel: BroadcastChannel | null): void {
  try {
    channel?.postMessage({ type: "file-saved", fileId: record.id, record });
  } catch {
    // BroadcastChannel is a best-effort early conflict signal; IndexedDB CAS is the source of truth.
  }
}

function parseFileBroadcast(value: unknown): FileRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as { type?: unknown; fileId?: unknown; record?: unknown };

  if (message.type !== "file-saved") {
    return null;
  }

  const record = normalizeFileRecord(message.record);

  if (!record || message.fileId !== record.id) {
    return null;
  }

  return record;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return fallback;
}

function viewModeLabel(viewMode: ViewMode): string {
  if (viewMode === "markdown") {
    return "Markdown";
  }

  if (viewMode === "preview") {
    return "Preview";
  }

  return "Split";
}

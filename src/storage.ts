import { DEFAULT_PREFERENCES } from "./defaults";
import { normalizePreferences } from "./preferences";
import type { Preferences } from "./types";

const DB_NAME = "live-markdown-preview";
const DB_VERSION = 1;
const STORE_NAME = "app";
const DRAFT_KEY = "draft";
const PREFERENCES_KEY = "preferences";
const FILES_INDEX_KEY = "files/index";
const ACTIVE_FILE_ID_KEY = "activeFileId";
const ERROR_LOG_KEY = "errorLog";
const LEGACY_FILE_ID = "legacy-draft";
const ERROR_LOG_LIMIT = 20;

export const STORAGE_TIMEOUT_MS = 4000;

export class StorageUnavailableError extends Error {
  constructor(
    message = "IndexedDB is unavailable.",
    readonly reason: "unavailable" | "timeout" = "unavailable"
  ) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

export interface DraftRecord {
  version: 2;
  markdown: string;
  revision: number;
  updatedAt: number;
  clientId?: string;
}

export interface FileRecord {
  version: 1;
  id: string;
  title: string;
  markdown: string;
  revision: number;
  updatedAt: number;
  clientId?: string;
}

export interface WorkspaceState {
  files: FileRecord[];
  activeFileId: string;
  activeFile: FileRecord;
}

export interface SaveFileRecordOptions {
  clientId: string;
  expectedRevision: number;
  overwrite?: boolean;
}

export type SaveDraftRecordOptions = SaveFileRecordOptions;

export interface ErrorLogEntry {
  type: string;
  message: string;
  timestamp: number;
  source?: string;
}

export interface AppStorageConfig {
  createId?: () => string;
  now?: () => number;
  timeoutMs?: number;
}

export class DraftConflictError extends Error {
  constructor(readonly storedRecord: FileRecord | null) {
    super("Draft was changed by another client.");
    this.name = "DraftConflictError";
  }
}

export interface AppStorage {
  loadDraft: () => Promise<string | null>;
  saveDraft: (markdown: string) => Promise<void>;
  loadDraftRecord: () => Promise<FileRecord | null>;
  saveDraftRecord: (markdown: string, options: SaveDraftRecordOptions) => Promise<FileRecord>;
  loadWorkspace: (defaultMarkdown: string) => Promise<WorkspaceState>;
  createFile: (markdown: string, title?: string) => Promise<FileRecord>;
  deleteFile: (fileId: string, defaultMarkdown: string) => Promise<WorkspaceState>;
  loadFileRecord: (fileId: string) => Promise<FileRecord | null>;
  renameFile: (fileId: string, title: string) => Promise<FileRecord>;
  setActiveFile: (fileId: string) => Promise<FileRecord>;
  saveFileRecord: (fileId: string, markdown: string, options: SaveFileRecordOptions) => Promise<FileRecord>;
  loadPreferences: () => Promise<Preferences>;
  savePreferences: (preferences: Preferences) => Promise<void>;
  appendErrorLog: (entry: Omit<ErrorLogEntry, "timestamp"> & { timestamp?: number }) => Promise<void>;
  readErrorLog: () => Promise<ErrorLogEntry[]>;
}

export function createAppStorage(): AppStorage;
export function createAppStorage(factory: IDBFactory | undefined, config?: AppStorageConfig): AppStorage;
export function createAppStorage(factory?: IDBFactory, config: AppStorageConfig = {}): AppStorage {
  const selectedFactory = arguments.length === 0 ? globalThis.indexedDB : factory;
  const timeoutMs = config.timeoutMs ?? STORAGE_TIMEOUT_MS;
  const now = config.now ?? (() => Date.now());
  const createId = config.createId ?? createFileId;
  const openDb = () => openDatabase(selectedFactory, timeoutMs);

  return {
    async loadDraft() {
      return (await this.loadDraftRecord())?.markdown ?? null;
    },
    async saveDraft(markdown: string) {
      const workspace = await this.loadWorkspace(markdown);

      await this.saveFileRecord(workspace.activeFileId, markdown, {
        clientId: "legacy",
        expectedRevision: workspace.activeFile.revision,
        overwrite: true
      });
    },
    async loadDraftRecord() {
      return (await this.loadWorkspace("")).activeFile;
    },
    async saveDraftRecord(markdown: string, options: SaveDraftRecordOptions) {
      const workspace = await this.loadWorkspace(markdown);

      return this.saveFileRecord(workspace.activeFileId, markdown, options);
    },
    async loadWorkspace(defaultMarkdown: string) {
      return loadWorkspaceValue(openDb, defaultMarkdown, timeoutMs, now);
    },
    async createFile(markdown: string, title?: string) {
      return createFileValue(openDb, markdown, title, timeoutMs, now, createId);
    },
    async deleteFile(fileId: string, defaultMarkdown: string) {
      await deleteFileValue(openDb, fileId, timeoutMs);

      return loadWorkspaceValue(openDb, defaultMarkdown, timeoutMs, now);
    },
    async loadFileRecord(fileId: string) {
      return normalizeFileRecord(await getValue<unknown>(openDb, fileKey(fileId), timeoutMs));
    },
    async renameFile(fileId: string, title: string) {
      return renameFileValue(openDb, fileId, title, timeoutMs, now);
    },
    async setActiveFile(fileId: string) {
      return setActiveFileValue(openDb, fileId, timeoutMs);
    },
    async saveFileRecord(fileId: string, markdown: string, options: SaveFileRecordOptions) {
      return saveFileRecordValue(openDb, fileId, markdown, options, timeoutMs, now);
    },
    async loadPreferences() {
      return normalizePreferences({
        ...DEFAULT_PREFERENCES,
        ...((await getValue<Partial<Preferences>>(openDb, PREFERENCES_KEY, timeoutMs)) ?? {})
      });
    },
    async savePreferences(preferences: Preferences) {
      await setValue(openDb, PREFERENCES_KEY, preferences, timeoutMs);
    },
    async appendErrorLog(entry: Omit<ErrorLogEntry, "timestamp"> & { timestamp?: number }) {
      await appendErrorLogValue(openDb, entry, timeoutMs, now);
    },
    async readErrorLog() {
      return normalizeErrorLog(await getValue<unknown>(openDb, ERROR_LOG_KEY, timeoutMs));
    }
  };
}

export function normalizeDraftRecord(value: unknown): DraftRecord | null {
  if (typeof value === "string") {
    return {
      version: 2,
      markdown: value,
      revision: 0,
      updatedAt: 0
    };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<DraftRecord>;
  const revision = Number(candidate.revision);
  const updatedAt = Number(candidate.updatedAt);

  if (
    candidate.version !== 2 ||
    typeof candidate.markdown !== "string" ||
    !Number.isFinite(revision) ||
    revision < 0 ||
    !Number.isInteger(revision) ||
    !Number.isFinite(updatedAt) ||
    updatedAt < 0
  ) {
    return null;
  }

  return {
    version: 2,
    markdown: candidate.markdown,
    revision,
    updatedAt,
    clientId: typeof candidate.clientId === "string" ? candidate.clientId : undefined
  };
}

export function normalizeFileRecord(value: unknown): FileRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<FileRecord>;
  const revision = Number(candidate.revision);
  const updatedAt = Number(candidate.updatedAt);

  if (
    candidate.version !== 1 ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0 ||
    typeof candidate.title !== "string" ||
    typeof candidate.markdown !== "string" ||
    !Number.isFinite(revision) ||
    revision < 0 ||
    !Number.isInteger(revision) ||
    !Number.isFinite(updatedAt) ||
    updatedAt < 0
  ) {
    return null;
  }

  return {
    version: 1,
    id: candidate.id,
    title: candidate.title,
    markdown: candidate.markdown,
    revision,
    updatedAt,
    clientId: typeof candidate.clientId === "string" ? candidate.clientId : undefined
  };
}

function openDatabase(factory: IDBFactory | undefined, timeoutMs: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) {
      reject(new StorageUnavailableError());
      return;
    }

    let settled = false;
    let request: IDBOpenDBRequest;
    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new StorageUnavailableError("IndexedDB open request timed out.", "timeout"));
      }
    }, timeoutMs);

    const resolveOnce = (database: IDBDatabase) => {
      window.clearTimeout(timeout);

      if (settled) {
        database.close();
        return;
      }

      settled = true;
      resolve(database);
    };

    const rejectOnce = (error: unknown) => {
      window.clearTimeout(timeout);

      if (!settled) {
        settled = true;
        reject(toStorageError(error));
      }
    };

    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (error) {
      rejectOnce(error);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolveOnce(request.result);
    };

    request.onerror = () => {
      rejectOnce(request.error);
    };

    request.onblocked = () => {
      rejectOnce(new StorageUnavailableError("IndexedDB open request was blocked."));
    };
  });
}

async function getValue<T>(
  openDb: () => Promise<IDBDatabase>,
  key: string,
  timeoutMs: number
): Promise<T | undefined> {
  const database = await openDb();

  try {
    return await runStoreTransaction<T | undefined>(database, "readonly", timeoutMs, `IndexedDB read ${key}`, (store, setResult, reject) => {
      const request = store.get(key);

      request.onsuccess = () => {
        setResult(request.result as T | undefined);
      };

      request.onerror = () => {
        reject(toStorageError(request.error));
      };
    });
  } finally {
    database.close();
  }
}

async function setValue(
  openDb: () => Promise<IDBDatabase>,
  key: string,
  value: unknown,
  timeoutMs: number
): Promise<void> {
  const database = await openDb();

  try {
    await runStoreTransaction<void>(database, "readwrite", timeoutMs, `IndexedDB write ${key}`, (store) => {
      store.put(value, key);
    });
  } finally {
    database.close();
  }
}

async function loadWorkspaceValue(
  openDb: () => Promise<IDBDatabase>,
  defaultMarkdown: string,
  timeoutMs: number,
  now: () => number
): Promise<WorkspaceState> {
  const database = await openDb();

  try {
    return await runStoreTransaction<WorkspaceState>(
      database,
      "readwrite",
      timeoutMs,
      "IndexedDB workspace load",
      (store, setResult, reject) => {
        const indexRequest = store.get(FILES_INDEX_KEY);

        indexRequest.onsuccess = () => {
          if (indexRequest.result === undefined) {
            const draftRequest = store.get(DRAFT_KEY);

            draftRequest.onsuccess = () => {
              const legacyDraft = normalizeDraftRecord(draftRequest.result);
              const markdown = legacyDraft?.markdown ?? defaultMarkdown;
              const activeFile = createFileRecord({
                id: LEGACY_FILE_ID,
                title: deriveTitle(markdown),
                markdown,
                revision: legacyDraft?.revision ?? 0,
                updatedAt: legacyDraft?.updatedAt || now(),
                clientId: legacyDraft?.clientId
              });

              store.put(activeFile, fileKey(activeFile.id));
              store.put([activeFile.id], FILES_INDEX_KEY);
              store.put(activeFile.id, ACTIVE_FILE_ID_KEY);
              setResult({
                files: [activeFile],
                activeFileId: activeFile.id,
                activeFile
              });
            };

            draftRequest.onerror = () => {
              reject(toStorageError(draftRequest.error));
            };
            return;
          }

          const ids = normalizeFileIndex(indexRequest.result);
          const records: FileRecord[] = [];
          let activeFileId: string | null = null;
          let pendingReads = ids.length + 1;

          const finishRead = () => {
            pendingReads -= 1;

            if (pendingReads > 0) {
              return;
            }

            const activeFile = records.find((record) => record.id === activeFileId) ?? records[0];

            if (!activeFile) {
              const fallbackFile = createFileRecord({
                id: LEGACY_FILE_ID,
                title: deriveTitle(defaultMarkdown),
                markdown: defaultMarkdown,
                revision: 0,
                updatedAt: now()
              });

              store.put(fallbackFile, fileKey(fallbackFile.id));
              store.put([fallbackFile.id], FILES_INDEX_KEY);
              store.put(fallbackFile.id, ACTIVE_FILE_ID_KEY);
              setResult({
                files: [fallbackFile],
                activeFileId: fallbackFile.id,
                activeFile: fallbackFile
              });
              return;
            }

            if (activeFile.id !== activeFileId) {
              store.put(activeFile.id, ACTIVE_FILE_ID_KEY);
            }

            setResult({
              files: orderFiles(ids, records),
              activeFileId: activeFile.id,
              activeFile
            });
          };

          const activeRequest = store.get(ACTIVE_FILE_ID_KEY);

          activeRequest.onsuccess = () => {
            activeFileId = typeof activeRequest.result === "string" ? activeRequest.result : null;
            finishRead();
          };

          activeRequest.onerror = () => {
            reject(toStorageError(activeRequest.error));
          };

          if (ids.length === 0) {
            return;
          }

          for (const id of ids) {
            const fileRequest = store.get(fileKey(id));

            fileRequest.onsuccess = () => {
              const record = normalizeFileRecord(fileRequest.result);

              if (record) {
                records.push(record);
              }

              finishRead();
            };

            fileRequest.onerror = () => {
              reject(toStorageError(fileRequest.error));
            };
          }
        };

        indexRequest.onerror = () => {
          reject(toStorageError(indexRequest.error));
        };
      }
    );
  } finally {
    database.close();
  }
}

async function createFileValue(
  openDb: () => Promise<IDBDatabase>,
  markdown: string,
  title: string | undefined,
  timeoutMs: number,
  now: () => number,
  createId: () => string
): Promise<FileRecord> {
  const database = await openDb();

  try {
    return await runStoreTransaction<FileRecord>(
      database,
      "readwrite",
      timeoutMs,
      "IndexedDB create file",
      (store, setResult, reject) => {
        const indexRequest = store.get(FILES_INDEX_KEY);

        indexRequest.onsuccess = () => {
          const currentIds = normalizeFileIndex(indexRequest.result);
          const id = createUniqueFileId(currentIds, createId);
          const record = createFileRecord({
            id,
            title: title ?? deriveTitle(markdown, "Untitled draft"),
            markdown,
            revision: 0,
            updatedAt: now()
          });

          store.put(record, fileKey(id));
          store.put([...currentIds, id], FILES_INDEX_KEY);
          store.put(id, ACTIVE_FILE_ID_KEY);
          setResult(record);
        };

        indexRequest.onerror = () => {
          reject(toStorageError(indexRequest.error));
        };
      }
    );
  } finally {
    database.close();
  }
}

async function deleteFileValue(
  openDb: () => Promise<IDBDatabase>,
  fileId: string,
  timeoutMs: number
): Promise<void> {
  const database = await openDb();

  try {
    await runStoreTransaction<void>(
      database,
      "readwrite",
      timeoutMs,
      "IndexedDB delete file",
      (store, setResult, reject) => {
        const indexRequest = store.get(FILES_INDEX_KEY);

        indexRequest.onsuccess = () => {
          const currentIds = normalizeFileIndex(indexRequest.result);
          const remainingIds = currentIds.filter((id) => id !== fileId);
          const activeRequest = store.get(ACTIVE_FILE_ID_KEY);

          activeRequest.onsuccess = () => {
            const activeFileId = typeof activeRequest.result === "string" ? activeRequest.result : null;

            store.delete(fileKey(fileId));
            store.put(remainingIds, FILES_INDEX_KEY);

            if (activeFileId === fileId || !remainingIds.includes(activeFileId ?? "")) {
              store.put(remainingIds[0] ?? LEGACY_FILE_ID, ACTIVE_FILE_ID_KEY);
            }

            setResult(undefined);
          };

          activeRequest.onerror = () => {
            reject(toStorageError(activeRequest.error));
          };
        };

        indexRequest.onerror = () => {
          reject(toStorageError(indexRequest.error));
        };
      }
    );
  } finally {
    database.close();
  }
}

async function setActiveFileValue(
  openDb: () => Promise<IDBDatabase>,
  fileId: string,
  timeoutMs: number
): Promise<FileRecord> {
  const database = await openDb();

  try {
    return await runStoreTransaction<FileRecord>(
      database,
      "readwrite",
      timeoutMs,
      "IndexedDB set active file",
      (store, setResult, reject, transaction) => {
        const fileRequest = store.get(fileKey(fileId));

        fileRequest.onsuccess = () => {
          const record = normalizeFileRecord(fileRequest.result);

          if (!record) {
            reject(new StorageUnavailableError("Selected file could not be loaded."));
            transaction.abort();
            return;
          }

          store.put(record.id, ACTIVE_FILE_ID_KEY);
          setResult(record);
        };

        fileRequest.onerror = () => {
          reject(toStorageError(fileRequest.error));
        };
      }
    );
  } finally {
    database.close();
  }
}

async function renameFileValue(
  openDb: () => Promise<IDBDatabase>,
  fileId: string,
  title: string,
  timeoutMs: number,
  now: () => number
): Promise<FileRecord> {
  const database = await openDb();

  try {
    return await runStoreTransaction<FileRecord>(
      database,
      "readwrite",
      timeoutMs,
      "IndexedDB rename file",
      (store, setResult, reject, transaction) => {
        const request = store.get(fileKey(fileId));

        request.onsuccess = () => {
          const currentRecord = normalizeFileRecord(request.result);

          if (!currentRecord) {
            reject(new StorageUnavailableError("Selected file could not be renamed."));
            transaction.abort();
            return;
          }

          const nextRecord = {
            ...currentRecord,
            title: normalizeFileTitle(title),
            updatedAt: now()
          };

          store.put(nextRecord, fileKey(fileId));
          setResult(nextRecord);
        };

        request.onerror = () => {
          reject(toStorageError(request.error));
        };
      }
    );
  } finally {
    database.close();
  }
}

async function saveFileRecordValue(
  openDb: () => Promise<IDBDatabase>,
  fileId: string,
  markdown: string,
  options: SaveFileRecordOptions,
  timeoutMs: number,
  now: () => number
): Promise<FileRecord> {
  const database = await openDb();

  try {
    return await runStoreTransaction<FileRecord>(
      database,
      "readwrite",
      timeoutMs,
      `IndexedDB save file ${fileId}`,
      (store, setResult, reject, transaction) => {
        const request = store.get(fileKey(fileId));

        request.onsuccess = () => {
          const currentRecord = normalizeFileRecord(request.result);

          if (!currentRecord) {
            reject(new StorageUnavailableError("File could not be saved because it no longer exists."));
            transaction.abort();
            return;
          }

          const currentRevision = currentRecord.revision;

          if (!options.overwrite && currentRevision !== options.expectedRevision) {
            reject(new DraftConflictError(currentRecord));
            transaction.abort();
            return;
          }

          const nextRecord = createFileRecord({
            id: fileId,
            title: currentRecord?.title ?? deriveTitle(markdown),
            markdown,
            revision: currentRevision + 1,
            updatedAt: now(),
            clientId: options.clientId
          });

          store.put(nextRecord, fileKey(fileId));
          setResult(nextRecord);
        };

        request.onerror = () => {
          reject(toStorageError(request.error));
        };
      }
    );
  } finally {
    database.close();
  }
}

async function appendErrorLogValue(
  openDb: () => Promise<IDBDatabase>,
  entry: Omit<ErrorLogEntry, "timestamp"> & { timestamp?: number },
  timeoutMs: number,
  now: () => number
): Promise<void> {
  const database = await openDb();

  try {
    await runStoreTransaction<void>(
      database,
      "readwrite",
      timeoutMs,
      "IndexedDB append error log",
      (store, setResult, reject) => {
        const request = store.get(ERROR_LOG_KEY);

        request.onsuccess = () => {
          const currentLog = normalizeErrorLog(request.result);
          const nextEntry = normalizeErrorLogEntry({
            ...entry,
            timestamp: entry.timestamp ?? now()
          });
          const nextLog = [...currentLog, nextEntry].slice(-ERROR_LOG_LIMIT);

          store.put(nextLog, ERROR_LOG_KEY);
          setResult(undefined);
        };

        request.onerror = () => {
          reject(toStorageError(request.error));
        };
      }
    );
  } finally {
    database.close();
  }
}

function runStoreTransaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  timeoutMs: number,
  operation: string,
  start: (
    store: IDBObjectStore,
    setResult: (result: T) => void,
    reject: (error: unknown) => void,
    transaction: IDBTransaction
  ) => void
): Promise<T> {
  return withStorageTimeout(
    new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      let result: T | undefined;
      let settled = false;
      let hasResult = false;

      const setResult = (nextResult: T) => {
        result = nextResult;
        hasResult = true;
      };

      const rejectOnce = (error: unknown) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      try {
        transaction = database.transaction(STORE_NAME, mode);
      } catch (error) {
        rejectOnce(toStorageError(error));
        return;
      }

      try {
        start(transaction.objectStore(STORE_NAME), setResult, rejectOnce, transaction);
      } catch (error) {
        rejectOnce(toStorageError(error));
        try {
          transaction.abort();
        } catch {
          // Transaction may already be closed.
        }
      }

      transaction.oncomplete = () => {
        if (!settled) {
          settled = true;
          resolve(result as T);
        }
      };

      transaction.onerror = () => {
        rejectOnce(toStorageError(transaction.error));
      };

      transaction.onabort = () => {
        rejectOnce(toStorageError(transaction.error));
      };

      if (mode === "readonly" && !hasResult) {
        // Read transactions set their result from request callbacks.
      }
    }),
    timeoutMs,
    operation
  );
}

function withStorageTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new StorageUnavailableError(`${operation} timed out.`, "timeout"));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => {
        window.clearTimeout(timeout);
      });
  });
}

function normalizeFileIndex(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids: string[] = [];

  for (const id of value) {
    if (typeof id === "string" && id.length > 0 && !ids.includes(id)) {
      ids.push(id);
    }
  }

  return ids;
}

function normalizeErrorLog(value: unknown): ErrorLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeErrorLogEntry).slice(-ERROR_LOG_LIMIT);
}

function normalizeErrorLogEntry(value: unknown): ErrorLogEntry {
  const candidate = value && typeof value === "object" ? (value as Partial<ErrorLogEntry>) : {};
  const timestamp = Number(candidate.timestamp);
  const entry: ErrorLogEntry = {
    type: toShortString(candidate.type, "unknown"),
    message: toShortString(candidate.message, "Unknown error"),
    timestamp: Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : Date.now()
  };

  if (typeof candidate.source === "string" && candidate.source.trim().length > 0) {
    entry.source = toShortString(candidate.source, "unknown");
  }

  return entry;
}

function createFileRecord(record: Omit<FileRecord, "version">): FileRecord {
  return {
    version: 1,
    id: record.id,
    title: record.title,
    markdown: record.markdown,
    revision: record.revision,
    updatedAt: record.updatedAt,
    clientId: record.clientId
  };
}

function orderFiles(ids: string[], records: FileRecord[]): FileRecord[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const ordered = ids.flatMap((id) => {
    const record = byId.get(id);
    return record ? [record] : [];
  });
  const missingFromIndex = records.filter((record) => !ids.includes(record.id));

  return [...ordered, ...missingFromIndex];
}

function createUniqueFileId(existingIds: string[], createId: () => string): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = createId();

    if (!existingIds.includes(id)) {
      return id;
    }
  }

  return `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createFileId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function deriveTitle(markdown: string, fallback = "Untitled draft"): string {
  const heading = markdown
    .split(/\r?\n/, 1)[0]
    ?.replace(/^#\s+/, "")
    .trim();

  return normalizeFileTitle(heading || fallback);
}

function normalizeFileTitle(title: string): string {
  return (title.trim() || "Untitled draft").slice(0, 80);
}

function fileKey(fileId: string): string {
  return `files/${fileId}`;
}

function toShortString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return (normalized || fallback).slice(0, 240);
}

function toStorageError(error: unknown): StorageUnavailableError {
  if (error instanceof StorageUnavailableError) {
    return error;
  }

  if (error instanceof Error) {
    return new StorageUnavailableError(error.message);
  }

  return new StorageUnavailableError();
}

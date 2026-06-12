import { DEFAULT_PREFERENCES } from "./defaults";
import { normalizePreferences } from "./preferences";
import type { Preferences } from "./types";

const DB_NAME = "live-markdown-preview";
const DB_VERSION = 1;
const STORE_NAME = "app";
const DRAFT_KEY = "draft";
const PREFERENCES_KEY = "preferences";

export class StorageUnavailableError extends Error {
  constructor(message = "IndexedDB is unavailable.") {
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

export interface SaveDraftRecordOptions {
  clientId: string;
  expectedRevision: number;
  overwrite?: boolean;
}

export class DraftConflictError extends Error {
  constructor(readonly storedRecord: DraftRecord | null) {
    super("Draft was changed by another client.");
    this.name = "DraftConflictError";
  }
}

export interface AppStorage {
  loadDraft: () => Promise<string | null>;
  saveDraft: (markdown: string) => Promise<void>;
  loadDraftRecord: () => Promise<DraftRecord | null>;
  saveDraftRecord: (markdown: string, options: SaveDraftRecordOptions) => Promise<DraftRecord>;
  loadPreferences: () => Promise<Preferences>;
  savePreferences: (preferences: Preferences) => Promise<void>;
}

export function createAppStorage(): AppStorage;
export function createAppStorage(factory: IDBFactory | undefined): AppStorage;
export function createAppStorage(factory?: IDBFactory): AppStorage {
  const selectedFactory = arguments.length === 0 ? globalThis.indexedDB : factory;
  const openDb = () => openDatabase(selectedFactory);

  return {
    async loadDraft() {
      return (await this.loadDraftRecord())?.markdown ?? null;
    },
    async saveDraft(markdown: string) {
      const current = await this.loadDraftRecord();

      await this.saveDraftRecord(markdown, {
        clientId: "legacy",
        expectedRevision: current?.revision ?? 0,
        overwrite: true
      });
    },
    async loadDraftRecord() {
      return normalizeDraftRecord(await getValue<unknown>(openDb, DRAFT_KEY));
    },
    async saveDraftRecord(markdown: string, options: SaveDraftRecordOptions) {
      return saveDraftRecordValue(openDb, markdown, options);
    },
    async loadPreferences() {
      return normalizePreferences({
        ...DEFAULT_PREFERENCES,
        ...((await getValue<Partial<Preferences>>(openDb, PREFERENCES_KEY)) ?? {})
      });
    },
    async savePreferences(preferences: Preferences) {
      await setValue(openDb, PREFERENCES_KEY, preferences);
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

function openDatabase(factory: IDBFactory | undefined): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) {
      reject(new StorageUnavailableError());
      return;
    }

    let request: IDBOpenDBRequest;

    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(toStorageError(error));
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(toStorageError(request.error));
    };

    request.onblocked = () => {
      reject(new StorageUnavailableError("IndexedDB open request was blocked."));
    };
  });
}

async function getValue<T>(
  openDb: () => Promise<IDBDatabase>,
  key: string
): Promise<T | undefined> {
  const database = await openDb();

  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result as T | undefined);
      };

      request.onerror = () => {
        reject(toStorageError(request.error));
      };

      transaction.onerror = () => {
        reject(toStorageError(transaction.error));
      };
    });
  } finally {
    database.close();
  }
}

async function setValue(
  openDb: () => Promise<IDBDatabase>,
  key: string,
  value: unknown
): Promise<void> {
  const database = await openDb();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      store.put(value, key);

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(toStorageError(transaction.error));
      };

      transaction.onabort = () => {
        reject(toStorageError(transaction.error));
      };
    });
  } finally {
    database.close();
  }
}

async function saveDraftRecordValue(
  openDb: () => Promise<IDBDatabase>,
  markdown: string,
  options: SaveDraftRecordOptions
): Promise<DraftRecord> {
  const database = await openDb();

  try {
    return await new Promise<DraftRecord>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(DRAFT_KEY);
      let settled = false;
      let nextRecord: DraftRecord | null = null;

      const rejectOnce = (error: unknown) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      request.onsuccess = () => {
        const currentRecord = normalizeDraftRecord(request.result);
        const currentRevision = currentRecord?.revision ?? 0;

        if (!options.overwrite && currentRevision !== options.expectedRevision) {
          rejectOnce(new DraftConflictError(currentRecord));
          transaction.abort();
          return;
        }

        nextRecord = {
          version: 2,
          markdown,
          revision: currentRevision + 1,
          updatedAt: Date.now(),
          clientId: options.clientId
        };

        const putRequest = store.put(nextRecord, DRAFT_KEY);

        putRequest.onerror = () => {
          rejectOnce(toStorageError(putRequest.error));
        };
      };

      request.onerror = () => {
        rejectOnce(toStorageError(request.error));
      };

      transaction.oncomplete = () => {
        if (!settled && nextRecord) {
          settled = true;
          resolve(nextRecord);
        }
      };

      transaction.onerror = () => {
        rejectOnce(toStorageError(transaction.error));
      };

      transaction.onabort = () => {
        rejectOnce(toStorageError(transaction.error));
      };
    });
  } finally {
    database.close();
  }
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

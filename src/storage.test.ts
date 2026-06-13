import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MARKDOWN } from "./defaults";
import { createAppStorage, DraftConflictError, StorageUnavailableError } from "./storage";

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("createAppStorage", () => {
  beforeEach(async () => {
    await deleteDatabase("live-markdown-preview");
  });

  it("migrates the legacy draft once without deleting the rollback key", async () => {
    const storage = createAppStorage(indexedDB);
    const legacyDraft = {
      version: 2,
      markdown: "# Old Draft",
      revision: 7,
      updatedAt: 1234,
      clientId: "legacy-client"
    };

    await seedValue("draft", legacyDraft);

    const workspace = await storage.loadWorkspace(DEFAULT_MARKDOWN);

    expect(workspace.activeFile).toMatchObject({
      version: 1,
      id: "legacy-draft",
      title: "Old Draft",
      markdown: "# Old Draft",
      revision: 7,
      clientId: "legacy-client"
    });
    expect(workspace.files).toHaveLength(1);
    expect(await readValue("draft")).toEqual(legacyDraft);
    expect(await readValue("files/index")).toEqual(["legacy-draft"]);
    expect(await readValue("activeFileId")).toBe("legacy-draft");
  });

  it("does not remigrate after the file index exists", async () => {
    const storage = createAppStorage(indexedDB);

    await seedValue("draft", "# Original");
    const firstWorkspace = await storage.loadWorkspace(DEFAULT_MARKDOWN);
    const saved = await storage.saveFileRecord(firstWorkspace.activeFileId, "# File workspace", {
      clientId: "client-a",
      expectedRevision: firstWorkspace.activeFile.revision
    });

    await seedValue("draft", "# Changed legacy rollback draft");

    const secondWorkspace = await storage.loadWorkspace(DEFAULT_MARKDOWN);

    expect(secondWorkspace.activeFile).toMatchObject({
      id: "legacy-draft",
      markdown: "# File workspace",
      revision: saved.revision
    });
    expect(secondWorkspace.files).toHaveLength(1);
    expect(await readValue("draft")).toBe("# Changed legacy rollback draft");
  });

  it("creates, switches, saves, and reloads multiple files", async () => {
    let nextId = 1;
    const storage = createAppStorage(indexedDB, {
      createId: () => `file-${nextId++}`
    });
    const workspace = await storage.loadWorkspace(DEFAULT_MARKDOWN);
    const secondFile = await storage.createFile(DEFAULT_MARKDOWN, "Second file");

    const savedSecond = await storage.saveFileRecord(secondFile.id, "# Second\n\nSaved", {
      clientId: "client-a",
      expectedRevision: secondFile.revision
    });
    const renamedSecond = await storage.renameFile(secondFile.id, "  Renamed second  ");

    await storage.setActiveFile(workspace.activeFileId);
    const savedFirst = await storage.saveFileRecord(workspace.activeFileId, "# First\n\nSaved", {
      clientId: "client-a",
      expectedRevision: workspace.activeFile.revision
    });

    const reloadedWorkspace = await createAppStorage(indexedDB).loadWorkspace(DEFAULT_MARKDOWN);
    const filesById = new Map(reloadedWorkspace.files.map((file) => [file.id, file]));

    expect(reloadedWorkspace.activeFileId).toBe(workspace.activeFileId);
    expect(filesById.get(workspace.activeFileId)).toMatchObject({
      markdown: "# First\n\nSaved",
      revision: savedFirst.revision
    });
    expect(filesById.get(secondFile.id)).toMatchObject({
      title: renamedSecond.title,
      markdown: "# Second\n\nSaved",
      revision: savedSecond.revision
    });
    expect(renamedSecond.title).toBe("Renamed second");
  });

  it("keeps conflicts scoped to the file being saved", async () => {
    let nextId = 1;
    const storage = createAppStorage(indexedDB, {
      createId: () => `file-${nextId++}`
    });
    const workspace = await storage.loadWorkspace(DEFAULT_MARKDOWN);
    const secondFile = await storage.createFile(DEFAULT_MARKDOWN, "Second file");

    const firstSave = await storage.saveFileRecord(workspace.activeFileId, "# First save", {
      clientId: "client-a",
      expectedRevision: workspace.activeFile.revision
    });

    await expect(
      storage.saveFileRecord(workspace.activeFileId, "# Stale first save", {
        clientId: "client-b",
        expectedRevision: workspace.activeFile.revision
      })
    ).rejects.toBeInstanceOf(DraftConflictError);

    await expect(
      storage.saveFileRecord(secondFile.id, "# Second save", {
        clientId: "client-b",
        expectedRevision: secondFile.revision
      })
    ).resolves.toMatchObject({ id: secondFile.id, markdown: "# Second save" });

    await expect(
      storage.saveFileRecord(workspace.activeFileId, "# Overwritten first save", {
        clientId: "client-b",
        expectedRevision: firstSave.revision,
        overwrite: true
      })
    ).resolves.toMatchObject({ id: workspace.activeFileId, markdown: "# Overwritten first save" });
  });

  it("deletes files, switches active file, and does not recreate deleted files on stale saves", async () => {
    let nextId = 1;
    const storage = createAppStorage(indexedDB, {
      createId: () => `file-${nextId++}`
    });
    const workspace = await storage.loadWorkspace(DEFAULT_MARKDOWN);
    const secondFile = await storage.createFile(DEFAULT_MARKDOWN, "Second file");

    const afterDeletingFirst = await storage.deleteFile(workspace.activeFileId, DEFAULT_MARKDOWN);

    expect(afterDeletingFirst.activeFileId).toBe(secondFile.id);
    expect(afterDeletingFirst.files.map((file) => file.id)).toEqual([secondFile.id]);
    expect(await readValue(`files/${workspace.activeFileId}`)).toBeUndefined();

    await expect(
      storage.saveFileRecord(workspace.activeFileId, "# Should not return", {
        clientId: "stale-client",
        expectedRevision: workspace.activeFile.revision
      })
    ).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(storage.renameFile(workspace.activeFileId, "Deleted file")).rejects.toBeInstanceOf(StorageUnavailableError);

    const afterDeletingLast = await storage.deleteFile(secondFile.id, DEFAULT_MARKDOWN);

    expect(afterDeletingLast.activeFileId).toBe("legacy-draft");
    expect(afterDeletingLast.files).toHaveLength(1);
    expect(afterDeletingLast.activeFile.markdown).toBe(DEFAULT_MARKDOWN);
  });

  it("keeps old preference records compatible and clamps stale split ratios", async () => {
    const storage = createAppStorage(indexedDB);

    await seedPreferences({ theme: "dark" });
    expect(await storage.loadPreferences()).toEqual({ theme: "dark", outlineVisible: true, splitRatio: 50 });

    await seedPreferences({ theme: "dark", outlineVisible: false, splitRatio: 95 });
    expect(await storage.loadPreferences()).toEqual({ theme: "dark", outlineVisible: false, splitRatio: 70 });

    await seedPreferences({ theme: "dark", outlineVisible: false, splitRatio: 10 });
    expect(await storage.loadPreferences()).toEqual({ theme: "dark", outlineVisible: false, splitRatio: 30 });
  });

  it("fails explicitly when IndexedDB is unavailable or times out", async () => {
    const unavailableStorage = createAppStorage(undefined);
    const hangingFactory = {
      open: () => ({})
    } as unknown as IDBFactory;
    const timedOutStorage = createAppStorage(hangingFactory, { timeoutMs: 1 });

    await expect(unavailableStorage.loadDraft()).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(unavailableStorage.saveDraft("# Draft")).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(unavailableStorage.loadWorkspace(DEFAULT_MARKDOWN)).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(timedOutStorage.loadDraft()).rejects.toMatchObject({
      name: "StorageUnavailableError",
      reason: "timeout"
    });
  });

  it("caps the technical error log without storing markdown content", async () => {
    const storage = createAppStorage(indexedDB);
    const secretMarkdown = "# Secret Markdown\n\nDo not log this";

    await storage.saveDraft(secretMarkdown);

    for (let index = 0; index < 25; index += 1) {
      await storage.appendErrorLog({
        type: "window error",
        message: `Error ${index}`,
        source: "test"
      });
    }

    const log = await storage.readErrorLog();

    expect(log).toHaveLength(20);
    expect(log[0]).toMatchObject({ message: "Error 5" });
    expect(JSON.stringify(log)).not.toContain(secretMarkdown);
  });
});

async function seedPreferences(value: unknown): Promise<void> {
  await seedValue("preferences", value);
}

async function seedValue(key: string, value: unknown): Promise<void> {
  const database = await openTestDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("app", "readwrite");

      transaction.objectStore("app").put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function readValue(key: string): Promise<unknown> {
  const database = await openTestDatabase();

  try {
    return await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction("app", "readonly");
      const request = transaction.objectStore("app").get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

function openTestDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("live-markdown-preview", 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore("app");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

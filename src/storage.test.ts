import { beforeEach, describe, expect, it } from "vitest";
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

  it("loads and saves the single draft and preferences", async () => {
    const storage = createAppStorage(indexedDB);

    await storage.saveDraft("# Draft");
    await storage.savePreferences({ theme: "dark", outlineVisible: false, splitRatio: 64 });

    expect(await storage.loadDraft()).toBe("# Draft");
    expect(await storage.loadDraftRecord()).toMatchObject({
      markdown: "# Draft",
      revision: 1,
      clientId: "legacy"
    });
    expect(await storage.loadPreferences()).toEqual({ theme: "dark", outlineVisible: false, splitRatio: 64 });
  });

  it("reads old string drafts as revision 0 and migrates them on first record save", async () => {
    const storage = createAppStorage(indexedDB);

    await seedValue("draft", "# Old Draft");

    expect(await storage.loadDraftRecord()).toEqual({
      version: 2,
      markdown: "# Old Draft",
      revision: 0,
      updatedAt: 0
    });

    const saved = await storage.saveDraftRecord("# New Draft", {
      clientId: "client-a",
      expectedRevision: 0
    });

    expect(saved).toMatchObject({
      version: 2,
      markdown: "# New Draft",
      revision: 1,
      clientId: "client-a"
    });
    expect(saved.updatedAt).toBeGreaterThan(0);
  });

  it("ignores corrupt draft records instead of failing app load", async () => {
    const storage = createAppStorage(indexedDB);

    await seedValue("draft", { version: 2, markdown: 42, revision: "bad", updatedAt: 0 });

    expect(await storage.loadDraft()).toBeNull();
    expect(await storage.loadDraftRecord()).toBeNull();
  });

  it("detects revision conflicts and supports explicit overwrite", async () => {
    const storage = createAppStorage(indexedDB);

    const first = await storage.saveDraftRecord("# First", {
      clientId: "client-a",
      expectedRevision: 0
    });

    await expect(
      storage.saveDraftRecord("# Second", {
        clientId: "client-b",
        expectedRevision: 0
      })
    ).rejects.toBeInstanceOf(DraftConflictError);

    const overwritten = await storage.saveDraftRecord("# Second", {
      clientId: "client-b",
      expectedRevision: first.revision,
      overwrite: true
    });

    expect(overwritten).toMatchObject({
      markdown: "# Second",
      revision: 2,
      clientId: "client-b"
    });
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

  it("fails explicitly when IndexedDB is unavailable", async () => {
    const storage = createAppStorage(undefined);

    await expect(storage.loadDraft()).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(storage.saveDraft("# Draft")).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(storage.loadDraftRecord()).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(
      storage.saveDraftRecord("# Draft", { clientId: "client-a", expectedRevision: 0 })
    ).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});

async function seedPreferences(value: unknown): Promise<void> {
  await seedValue("preferences", value);
}

async function seedValue(key: string, value: unknown): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("live-markdown-preview", 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore("app");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

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

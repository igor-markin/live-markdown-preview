import type { FileRecord } from "./storage";
import type { SaveState } from "./types";

export interface DocumentSession {
  fileId: string;
  workingMarkdown: string;
  savedMarkdown: string;
  savedRevision: number;
  saveState: SaveState;
  remoteFile: FileRecord | null;
  dirty: boolean;
}

export interface RestoredDocumentDraft {
  fileId: string;
  markdown: string;
  expectedRevision: number;
  state?: "pending" | "conflict";
}

export class DocumentSessionRegistry {
  private readonly sessions = new Map<string, DocumentSession>();

  seed(records: FileRecord[]): void {
    for (const record of records) {
      if (!this.sessions.has(record.id)) {
        this.sessions.set(record.id, createSavedSession(record));
      }
    }
  }

  open(record: FileRecord): DocumentSession {
    const existing = this.sessions.get(record.id);

    if (!existing) {
      const session = createSavedSession(record);
      this.sessions.set(record.id, session);
      return session;
    }

    if (!existing.dirty && existing.saveState !== "conflict") {
      existing.workingMarkdown = record.markdown;
      existing.savedMarkdown = record.markdown;
      existing.savedRevision = record.revision;
      existing.saveState = "saved";
      existing.remoteFile = null;
    }

    return existing;
  }

  get(fileId: string): DocumentSession | null {
    return this.sessions.get(fileId) ?? null;
  }

  updateWorkingCopy(fileId: string, markdown: string): DocumentSession | null {
    const session = this.sessions.get(fileId);

    if (!session) {
      return null;
    }

    session.workingMarkdown = markdown;
    session.dirty = markdown !== session.savedMarkdown;

    if (session.saveState !== "conflict") {
      session.saveState = session.dirty ? "saving" : "saved";
    }

    return session;
  }

  setSaveState(fileId: string, saveState: SaveState): DocumentSession | null {
    const session = this.sessions.get(fileId);

    if (!session) {
      return null;
    }

    session.saveState = saveState;
    return session;
  }

  markSaved(record: FileRecord): DocumentSession {
    const session = this.sessions.get(record.id) ?? createSavedSession(record);
    session.savedMarkdown = record.markdown;
    session.savedRevision = record.revision;
    session.remoteFile = null;
    session.dirty = session.workingMarkdown !== record.markdown;
    session.saveState = session.dirty ? "saving" : "saved";
    this.sessions.set(record.id, session);
    return session;
  }

  acceptSaved(record: FileRecord): DocumentSession {
    const session = createSavedSession(record);
    this.sessions.set(record.id, session);
    return session;
  }

  markConflict(fileId: string, remoteFile: FileRecord | null): DocumentSession | null {
    const session = this.sessions.get(fileId);

    if (!session) {
      return null;
    }

    if (remoteFile) {
      session.savedMarkdown = remoteFile.markdown;
      session.savedRevision = remoteFile.revision;
    }

    session.remoteFile = remoteFile;
    session.dirty = session.workingMarkdown !== session.savedMarkdown;
    session.saveState = "conflict";
    return session;
  }

  restore(record: FileRecord, draft: RestoredDocumentDraft): DocumentSession {
    const session = this.sessions.get(record.id) ?? createSavedSession(record);
    session.workingMarkdown = draft.markdown;
    session.savedMarkdown = record.markdown;
    session.savedRevision = draft.state === "conflict" ? record.revision : draft.expectedRevision;
    session.saveState = draft.state === "conflict" ? "conflict" : "saving";
    session.remoteFile = draft.state === "conflict" ? record : null;
    session.dirty = draft.markdown !== record.markdown;
    this.sessions.set(record.id, session);
    return session;
  }

  remove(fileId: string): void {
    this.sessions.delete(fileId);
  }

  unsaved(): DocumentSession[] {
    return [...this.sessions.values()].filter(
      (session) => session.dirty || session.saveState === "conflict" || session.saveState === "unavailable"
    );
  }
}

function createSavedSession(record: FileRecord): DocumentSession {
  return {
    fileId: record.id,
    workingMarkdown: record.markdown,
    savedMarkdown: record.markdown,
    savedRevision: record.revision,
    saveState: "saved",
    remoteFile: null,
    dirty: false
  };
}

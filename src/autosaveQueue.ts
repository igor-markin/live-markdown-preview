import { DocumentSessionRegistry, type DocumentSession } from "./documentSessions";
import type { FileRecord } from "./storage";

export interface PendingSave {
  fileId: string;
  markdown: string;
  expectedRevision: number;
}

export function takePendingSave(
  pendingSaves: Map<string, PendingSave>,
  activeFileId: string | null,
  canSave: (fileId: string) => boolean
): PendingSave | null {
  const activeSave = activeFileId ? pendingSaves.get(activeFileId) : undefined;

  if (activeSave && canSave(activeSave.fileId)) {
    pendingSaves.delete(activeSave.fileId);
    return activeSave;
  }

  for (const nextSave of pendingSaves.values()) {
    if (!canSave(nextSave.fileId)) {
      continue;
    }

    pendingSaves.delete(nextSave.fileId);
    return nextSave;
  }

  return null;
}

export function settleAutosaveConflict(
  pendingSaves: Map<string, PendingSave>,
  sessions: DocumentSessionRegistry,
  failedSave: PendingSave,
  remoteFile: FileRecord | null
): { outcome: "saved" | "conflict"; session: DocumentSession | null } {
  const session = sessions.get(failedSave.fileId);
  pendingSaves.delete(failedSave.fileId);

  if (remoteFile && session?.workingMarkdown === remoteFile.markdown) {
    return { outcome: "saved", session: sessions.markSaved(remoteFile) };
  }

  return {
    outcome: "conflict",
    session: sessions.markConflict(failedSave.fileId, remoteFile)
  };
}

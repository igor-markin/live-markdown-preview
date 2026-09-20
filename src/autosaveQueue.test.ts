import { describe, expect, it } from "vitest";
import { settleAutosaveConflict, takePendingSave, type PendingSave } from "./autosaveQueue";
import { DocumentSessionRegistry } from "./documentSessions";
import type { FileRecord } from "./storage";

describe("autosave queue conflicts", () => {
  it("does not retry a queued edit against the remote revision after an in-flight save conflicts", () => {
    const stored = file("draft", "# Base", 4);
    const remote = file("draft", "# Remote", 5);
    const sessions = new DocumentSessionRegistry();
    const pending = new Map<string, PendingSave>();
    sessions.seed([stored]);

    sessions.updateWorkingCopy(stored.id, "# Local in flight");
    const inFlight: PendingSave = {
      fileId: stored.id,
      markdown: "# Local in flight",
      expectedRevision: stored.revision
    };

    sessions.updateWorkingCopy(stored.id, "# Local queued");
    pending.set(stored.id, {
      fileId: stored.id,
      markdown: "# Local queued",
      expectedRevision: stored.revision
    });

    const result = settleAutosaveConflict(pending, sessions, inFlight, remote);

    expect(result.outcome).toBe("conflict");
    expect(
      takePendingSave(pending, stored.id, (fileId) => sessions.get(fileId)?.saveState !== "conflict")
    ).toBeNull();
    expect(pending).toHaveLength(0);
    expect(sessions.get(stored.id)).toMatchObject({
      workingMarkdown: "# Local queued",
      savedMarkdown: "# Remote",
      savedRevision: remote.revision,
      saveState: "conflict",
      remoteFile: remote
    });
  });
});

function file(id: string, markdown: string, revision: number): FileRecord {
  return {
    version: 1,
    id,
    title: id,
    markdown,
    revision,
    updatedAt: revision,
    clientId: "test"
  };
}

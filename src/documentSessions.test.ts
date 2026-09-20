import { describe, expect, it } from "vitest";
import { DocumentSessionRegistry } from "./documentSessions";
import type { FileRecord } from "./storage";

describe("DocumentSessionRegistry", () => {
  it("preserves independent working copies across rapid file switches", () => {
    const first = file("first", "# Stored A", 2);
    const second = file("second", "# Stored B", 4);
    const sessions = new DocumentSessionRegistry();
    sessions.seed([first, second]);

    sessions.updateWorkingCopy(first.id, "# Unsaved A");
    sessions.open(second);

    expect(sessions.open(first)).toMatchObject({
      workingMarkdown: "# Unsaved A",
      savedMarkdown: "# Stored A",
      dirty: true,
      saveState: "saving"
    });
  });

  it("keeps a conflicting working copy when another document is opened", () => {
    const first = file("first", "# Stored A", 2);
    const second = file("second", "# Stored B", 4);
    const remote = file("first", "# Remote A", 3);
    const sessions = new DocumentSessionRegistry();
    sessions.seed([first, second]);

    sessions.updateWorkingCopy(first.id, "# Local A");
    sessions.markConflict(first.id, remote);
    sessions.open(second);

    expect(sessions.open(first)).toMatchObject({
      workingMarkdown: "# Local A",
      savedRevision: 3,
      saveState: "conflict",
      remoteFile: remote
    });
  });

  it("restores multiple unsaved documents independently", () => {
    const first = file("first", "# Stored A", 2);
    const second = file("second", "# Stored B", 4);
    const sessions = new DocumentSessionRegistry();
    sessions.seed([first, second]);

    sessions.restore(first, { fileId: first.id, markdown: "# Recovered A", expectedRevision: 2 });
    sessions.restore(second, { fileId: second.id, markdown: "# Recovered B", expectedRevision: 4 });

    expect(sessions.unsaved().map((session) => [session.fileId, session.workingMarkdown])).toEqual([
      ["first", "# Recovered A"],
      ["second", "# Recovered B"]
    ]);
  });

  it("restores a conflict without turning the local copy into an automatic save", () => {
    const remote = file("first", "# Remote A", 7);
    const sessions = new DocumentSessionRegistry();
    sessions.seed([remote]);

    sessions.restore(remote, {
      fileId: remote.id,
      markdown: "# Local A",
      expectedRevision: remote.revision,
      state: "conflict"
    });

    expect(sessions.get(remote.id)).toMatchObject({
      workingMarkdown: "# Local A",
      savedMarkdown: "# Remote A",
      savedRevision: remote.revision,
      saveState: "conflict",
      remoteFile: remote,
      dirty: true
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

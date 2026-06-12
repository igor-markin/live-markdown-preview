import { describe, expect, it, vi } from "vitest";
import type { WorkerRequest, WorkerResponse } from "./types";
import { MarkdownWorkerClient, type WorkerLike } from "./workerClient";

class FakeWorker implements WorkerLike {
  readonly sent: WorkerRequest[] = [];
  terminated = false;
  private listener: ((event: MessageEvent<WorkerResponse>) => void) | null = null;

  postMessage(message: WorkerRequest): void {
    this.sent.push(message);
  }

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void
  ): void {
    this.listener = listener;
  }

  removeEventListener(): void {
    this.listener = null;
  }

  terminate(): void {
    this.terminated = true;
    this.listener = null;
  }

  emit(message: WorkerResponse): void {
    this.listener?.({ data: message } as MessageEvent<WorkerResponse>);
  }
}

describe("MarkdownWorkerClient", () => {
  it("ignores stale worker render results", () => {
    const worker = new FakeWorker();
    const client = new MarkdownWorkerClient(worker);
    const onRendered = vi.fn();
    const onError = vi.fn();

    client.render("# Old", { onRendered, onError });
    client.render("# New", { onRendered, onError });

    worker.emit({
      type: "rendered",
      version: 1,
      result: { html: "<h1>Old</h1>", headings: [], diagnostics: [] }
    });
    worker.emit({
      type: "rendered",
      version: 2,
      result: { html: "<h1>New</h1>", headings: [], diagnostics: [] }
    });

    expect(onRendered).toHaveBeenCalledTimes(1);
    expect(onRendered).toHaveBeenCalledWith({ html: "<h1>New</h1>", headings: [], diagnostics: [] });
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports unavailable workers without throwing", () => {
    const client = new MarkdownWorkerClient(() => {
      throw new Error("blocked");
    });
    const onRendered = vi.fn();
    const onError = vi.fn();

    client.render("# Draft", { onRendered, onError });

    expect(onRendered).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Render unavailable");
  });

  it("forwards render errors from the worker", () => {
    const worker = new FakeWorker();
    const client = new MarkdownWorkerClient(worker);
    const onRendered = vi.fn();
    const onError = vi.fn();

    client.render("# Broken", { onRendered, onError });
    worker.emit({
      type: "render_error",
      version: 1,
      error: "Parser failed"
    });

    expect(onRendered).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Parser failed");
  });

  it("retries the latest render once after recreating a timed out worker", () => {
    vi.useFakeTimers();

    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const workers = [firstWorker, secondWorker];
    const client = new MarkdownWorkerClient(() => workers.shift() ?? new FakeWorker(), 20);
    const onRendered = vi.fn();
    const onError = vi.fn();

    client.render("# Old", { onRendered, onError });
    client.render("# New", { onRendered, onError });
    vi.advanceTimersByTime(20);

    expect(firstWorker.terminated).toBe(true);
    expect(secondWorker.sent).toEqual([{ type: "render", version: 2, markdown: "# New" }]);
    expect(onError).not.toHaveBeenCalled();

    secondWorker.emit({
      type: "rendered",
      version: 2,
      result: { html: "<h1>New</h1>", headings: [], diagnostics: [] }
    });

    expect(onRendered).toHaveBeenCalledWith({ html: "<h1>New</h1>", headings: [], diagnostics: [] });
    expect(onError).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("reports a timeout after the retry also stalls", () => {
    vi.useFakeTimers();

    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const workers = [firstWorker, secondWorker];
    const client = new MarkdownWorkerClient(() => workers.shift() ?? new FakeWorker(), 20);
    const onRendered = vi.fn();
    const onError = vi.fn();

    client.render("# Slow", { onRendered, onError });
    vi.advanceTimersByTime(20);
    vi.advanceTimersByTime(20);

    expect(onRendered).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Render timed out");
    expect(firstWorker.terminated).toBe(true);
    expect(secondWorker.terminated).toBe(true);
    expect(workers).toHaveLength(0);

    vi.useRealTimers();
  });
});

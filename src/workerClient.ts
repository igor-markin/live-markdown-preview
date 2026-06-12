import type { RenderResult, WorkerRequest, WorkerResponse } from "./types";
import { RENDER_TIMEOUT_MS } from "./limits";

export interface RenderCallbacks {
  onRendered: (result: RenderResult) => void;
  onError: (error: string) => void;
}

export interface WorkerLike {
  postMessage: (message: WorkerRequest) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void
  ) => void;
  removeEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void
  ) => void;
  terminate: () => void;
}

export type WorkerFactory = () => WorkerLike;

export class MarkdownWorkerClient {
  private latestVersion = 0;
  private callbacks: RenderCallbacks | null = null;
  private latestMarkdown = "";
  private renderTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private worker: WorkerLike | null = null;
  private readonly createWorker: WorkerFactory;

  constructor(
    workerOrFactory: WorkerLike | WorkerFactory = createDefaultWorker,
    private readonly timeoutMs = RENDER_TIMEOUT_MS
  ) {
    this.createWorker = isWorkerLike(workerOrFactory) ? () => workerOrFactory : workerOrFactory;
  }

  render(markdown: string, callbacks: RenderCallbacks): number {
    this.latestVersion += 1;
    this.callbacks = callbacks;
    this.latestMarkdown = markdown;
    this.clearRenderTimer();

    this.postRender(this.latestVersion, markdown, false);

    return this.latestVersion;
  }

  terminate(): void {
    this.clearRenderTimer();
    this.destroyWorker();
  }

  get currentVersion(): number {
    return this.latestVersion;
  }

  private postRender(version: number, markdown: string, isRetry: boolean): void {
    const worker = this.ensureWorker();
    const callbacks = this.callbacks;

    if (!worker || !callbacks) {
      callbacks?.onError("Render unavailable");
      return;
    }

    this.renderTimer = globalThis.setTimeout(() => {
      if (version !== this.latestVersion || !this.callbacks) {
        return;
      }

      this.recreateWorker();

      if (!isRetry) {
        this.postRender(version, this.latestMarkdown, true);
        return;
      }

      this.callbacks.onError("Render timed out");
    }, this.timeoutMs);

    try {
      worker.postMessage({
        type: "render",
        version,
        markdown
      });
    } catch {
      this.clearRenderTimer();
      callbacks.onError("Render unavailable");
      this.recreateWorker();
    }
  }

  private readonly handleMessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;

    if (message.version !== this.latestVersion || !this.callbacks) {
      return;
    }

    this.clearRenderTimer();

    if (message.type === "rendered") {
      this.callbacks.onRendered(message.result);
      return;
    }

    this.callbacks.onError(message.error);
  };

  private ensureWorker(): WorkerLike | null {
    if (this.worker) {
      return this.worker;
    }

    try {
      this.worker = this.createWorker();
      this.worker.addEventListener("message", this.handleMessage);
      return this.worker;
    } catch {
      return null;
    }
  }

  private recreateWorker(): void {
    this.destroyWorker();
    this.ensureWorker();
  }

  private destroyWorker(): void {
    if (!this.worker) {
      return;
    }

    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.terminate();
    this.worker = null;
  }

  private clearRenderTimer(): void {
    if (this.renderTimer !== null) {
      globalThis.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
  }
}

function createDefaultWorker(): WorkerLike {
  return new Worker(new URL("./markdown.worker.ts", import.meta.url), {
    type: "module"
  });
}

function isWorkerLike(value: WorkerLike | WorkerFactory): value is WorkerLike {
  return typeof value === "object" && value !== null && "postMessage" in value;
}

import { renderMarkdown } from "./markdown/render";
import type { WorkerRequest, WorkerResponse } from "./types";

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  void handleMessage(event.data);
});

async function handleMessage(message: WorkerRequest): Promise<void> {
  if (message.type !== "render") {
    return;
  }

  try {
    const result = await renderMarkdown(message.markdown);
    const response: WorkerResponse = {
      type: "rendered",
      version: message.version,
      result
    };
    worker.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      type: "render_error",
      version: message.version,
      error: error instanceof Error ? error.message : "Unknown markdown render error."
    };
    worker.postMessage(response);
  }
}

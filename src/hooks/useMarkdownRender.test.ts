import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_LIVE_RENDER_CHARS } from "../limits";
import { useMarkdownRender } from "./useMarkdownRender";

interface RenderCallbacks {
  onRendered: (result: { html: string; headings: []; diagnostics: [] }) => void;
  onError: (error: string) => void;
}

const workerHarness = vi.hoisted(() => ({
  instances: [] as Array<{ callbacks: RenderCallbacks[] }>
}));

vi.mock("../workerClient", () => ({
  MarkdownWorkerClient: class {
    callbacks: RenderCallbacks[] = [];

    constructor() {
      workerHarness.instances.push(this);
    }

    render(_markdown: string, callbacks: RenderCallbacks) {
      this.callbacks.push(callbacks);
    }

    terminate() {}
  }
}));

describe("useMarkdownRender", () => {
  const container = document.createElement("div");

  afterEach(() => {
    act(() => render(null, container));
    workerHarness.instances.length = 0;
    vi.useRealTimers();
  });

  it("keeps preview paused when an older render finishes after the document crosses the size limit", async () => {
    vi.useFakeTimers();

    act(() => render(h(RenderProbe, { markdown: "# Old render" }), container));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });

    const worker = workerHarness.instances[0];
    expect(worker.callbacks).toHaveLength(1);

    act(() => render(h(RenderProbe, { markdown: "x".repeat(MAX_LIVE_RENDER_CHARS + 1) }), container));
    expect(container.querySelector("output")?.dataset.state).toBe("paused");

    act(() => {
      worker.callbacks[0].onRendered({ html: "<h1>Stale</h1>", headings: [], diagnostics: [] });
    });

    expect(container.querySelector("output")?.dataset.state).toBe("paused");
    expect(container.textContent).toContain("Live preview paused: document is too large");
  });
});

function RenderProbe({ markdown }: { markdown: string }) {
  const result = useMarkdownRender(markdown, () => undefined);
  return h("output", { "data-state": result.renderState }, result.renderMessage);
}

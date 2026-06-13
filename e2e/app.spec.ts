import { expect, type Page, test } from "@playwright/test";

test("typing updates preview and reload restores draft", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.headers()["content-security-policy"]).toContain("worker-src 'self'");
  expect(response?.headers()["content-security-policy"]).toContain("style-src 'self' 'nonce-bGl2ZS1tYXJrZG93bi1wcmV2aWV3'");

  await replaceEditorText(page, "# Project\n\n- [x] Ready");

  await expect(page.locator(".markdown-preview h1")).toHaveText("Project");
  await expect(page.locator(".markdown-preview input[type='checkbox']")).toBeChecked();
  await waitForDraft(page, "# Project\n\n- [x] Ready");

  await page.reload();
  await expect(page.locator(".markdown-preview h1")).toHaveText("Project");
});

test("copy buttons write markdown and sanitized HTML", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4173"
  });

  await page.goto("/");
  await replaceEditorText(
    page,
    `# Copy\n\n<script>alert('bad')</script>\n\n<strong>Ok</strong>\n\n<p>Intro line</p>${"\n".repeat(126)}<table><tbody><tr><td>Alpha</td></tr></tbody></table>`
  );
  await expect(page.locator(".markdown-preview h1")).toHaveText("Copy");

  await page.getByRole("button", { name: "Copy Markdown source" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("<script>");
  await expect(page.locator(".statusbar")).toContainText("Markdown copied");

  await page.getByRole("button", { name: "Copy sanitized HTML" }).click();

  const html = await page.evaluate(() => navigator.clipboard.readText());
  expect(html).toContain("<h1");
  expect(html).toContain("<strong>Ok</strong>");
  expect(html).toContain("<table>");
  expect(html).not.toContain("\n\n\n");
  expect(html).not.toContain("<script>");
  await expect(page.locator(".statusbar")).toContainText("HTML copied");
});

test("desktop layout keeps chrome visible, keeps sidebar, and persists split ratio", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/");

  await expect(page.locator(".markdown-preview h1")).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".statusbar")).toBeVisible();
  await expect(page.locator(".cm-editor")).toHaveAttribute("data-gramm", "false");
  await expect(page.locator(".cm-content")).toHaveAttribute("data-enable-grammarly", "false");
  await expect(page.locator(".statusbar")).not.toHaveAttribute("aria-live", "polite");
  await expect(page.locator(".statusbar")).toContainText(/Rendered in \d+ ms/);
  await expect(page.locator(".statusbar svg")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Templates" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Safe Beautify Markdown" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "About" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Markdown", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Copy Markdown", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy Markdown source", exact: true })).toHaveCount(1);

  const toolbarOrder = await page.locator(".toolbar").evaluate((toolbar) =>
    Array.from(toolbar.children).map((element) => element.getAttribute("aria-label") ?? "separator")
  );

  expect(toolbarOrder).toEqual([
    "Copy Markdown source",
    "Copy sanitized HTML",
    "separator",
    "Export PDF",
    "Help",
    "Open GitHub repository",
    "separator",
    "Color scheme"
  ]);
  expect(await page.locator(".toolbar .toolbar-separator").count()).toBe(2);

  const topbarControlOrder = await page.locator(".topbar-controls").evaluate((controls) => {
    const names: string[] = [];

    for (const element of Array.from(controls.children)) {
      if (element.classList.contains("topbar-divider")) {
        names.push("divider");
        continue;
      }

      if (element.classList.contains("view-switcher")) {
        for (const child of Array.from(element.children)) {
          names.push(child.getAttribute("aria-label") ?? child.textContent?.trim() ?? "");
        }
        continue;
      }

      names.push(element.getAttribute("aria-label") ?? "");
    }

    return names;
  });

  expect(topbarControlOrder).toEqual(["Undo", "Redo", "divider", "Hide sidebar", "Markdown", "Split", "Preview"]);
  expect(await page.locator(".topbar-divider").count()).toBe(1);

  const toolbarOverflow = await page.locator(".toolbar").evaluate((toolbar) => ({
    clientWidth: toolbar.clientWidth,
    overflowX: getComputedStyle(toolbar).overflowX,
    scrollWidth: toolbar.scrollWidth
  }));

  expect(toolbarOverflow.overflowX).not.toBe("auto");
  expect(toolbarOverflow.overflowX).not.toBe("scroll");
  expect(toolbarOverflow.scrollWidth).toBeLessThanOrEqual(toolbarOverflow.clientWidth + 1);

  const topbarControlsOverflow = await page.locator(".topbar-controls").evaluate((controls) => ({
    clientWidth: controls.clientWidth,
    overflowX: getComputedStyle(controls).overflowX,
    scrollWidth: controls.scrollWidth
  }));

  expect(topbarControlsOverflow.overflowX).not.toBe("auto");
  expect(topbarControlsOverflow.overflowX).not.toBe("scroll");
  expect(topbarControlsOverflow.scrollWidth).toBeLessThanOrEqual(topbarControlsOverflow.clientWidth + 1);

  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.locator(".workspace-sidebar .outline")).toBeVisible();
  await expect(page.locator(".editor-pane .outline")).toHaveCount(0);
  await expect(page.locator(".preview-pane .outline")).toHaveCount(0);

  const outlineBox = await page.locator(".workspace-sidebar").boundingBox();
  const editorShellBox = await page.locator(".editor-shell").boundingBox();
  expect(outlineBox?.x ?? 0).toBeLessThan(editorShellBox?.x ?? 0);

  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(page.locator(".workspace-sidebar")).toHaveCount(0);
  const hiddenEditorPaneBox = await page.locator(".editor-pane").boundingBox();
  const hiddenEditorShellBox = await page.locator(".editor-shell").boundingBox();
  expect(hiddenEditorPaneBox).not.toBeNull();
  expect(hiddenEditorShellBox).not.toBeNull();
  expect(Math.round(hiddenEditorShellBox!.x)).toBe(Math.round(hiddenEditorPaneBox!.x));
  await waitForPreferences(page, { outlineVisible: false, splitRatio: 50 });

  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await waitForPreferences(page, { outlineVisible: true, splitRatio: 50 });

  const splitter = page.getByRole("separator", { name: "Resize Markdown and Preview panes" });
  await expect(splitter).toHaveCSS("cursor", "col-resize");
  const splitterBox = await splitter.boundingBox();
  expect(splitterBox).not.toBeNull();

  await page.mouse.move(splitterBox!.x + splitterBox!.width / 2, splitterBox!.y + splitterBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(splitterBox!.x + splitterBox!.width / 2 + 140, splitterBox!.y + splitterBox!.height / 2);
  await expect(page.locator(".split-ratio-indicator")).toContainText(/% \/ \d+%/);
  await page.mouse.up();
  await expect(page.locator(".split-ratio-indicator")).toHaveCount(0);

  const splitAfterDrag = Number(await splitter.getAttribute("aria-valuenow"));
  expect(splitAfterDrag).toBeGreaterThan(50);
  await waitForPreferences(page, { outlineVisible: true, splitRatio: splitAfterDrag });

  await page.locator(".preview-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator(".topbar")).toBeInViewport();
  await expect(page.locator(".statusbar")).toBeInViewport();

  await page.reload();
  await expect(page.locator(".workspace-sidebar .outline")).toBeVisible();
  await expect(splitter).toHaveAttribute("aria-valuenow", String(splitAfterDrag));

  await splitter.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(splitAfterDrag - 2));
  await expect(page.locator(".split-ratio-indicator")).toContainText(
    `${splitAfterDrag - 2}% / ${100 - (splitAfterDrag - 2)}%`
  );
  await waitForPreferences(page, { outlineVisible: true, splitRatio: splitAfterDrag - 2 });
});

test("PDF export, help, and GitHub action work without About", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      (window as Window & { __printCalled?: boolean }).__printCalled = true;
    };
  });

  await page.goto("/");
  await expect(page.locator(".statusbar")).toContainText(/Rendered in \d+ ms/);

  await expect(page.getByRole("button", { name: "About" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "About" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Help" })).toHaveCount(1);

  await page.getByRole("button", { name: "Help" }).click();
  const helpDialog = page.getByRole("dialog", { name: "Help" });

  await expect(helpDialog).toBeVisible();
  await expect(helpDialog).toContainText("Guide");
  await expect(helpDialog).toContainText("Shortcuts");
  await expect(helpDialog).toContainText("Features");
  await expect(page.getByRole("button", { name: "Close help" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close help" })).toBeFocused();

  await page.getByRole("button", { name: "Close help" }).click();
  await expect(helpDialog).toHaveCount(0);

  await expect(page.getByRole("link", { name: "Open GitHub repository" })).toHaveAttribute(
    "href",
    "https://github.com/igor-markin/live-markdown-preview"
  );
  await expect(page.getByRole("link", { name: "Open GitHub repository" })).toHaveAttribute("rel", "noopener noreferrer");

  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __printCalled?: boolean }).__printCalled)).toBe(true);
  await expect(page.locator(".statusbar")).toContainText("Print dialog opened");
});

test("print media renders preview when responsive editor mode hides it on screen", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/");

  await expect(page.locator(".preview-pane")).toBeHidden();

  await page.emulateMedia({ media: "print" });

  await expect(page.locator(".preview-pane")).toBeVisible();
  await expect(page.locator(".markdown-preview h1")).toHaveText("Untitled draft");
  await expect(page.locator(".markdown-preview h1")).toBeVisible();

  const printState = await page.evaluate(() => ({
    editorDisplay: getComputedStyle(document.querySelector(".editor-pane") as Element).display,
    previewDisplay: getComputedStyle(document.querySelector(".preview-pane") as Element).display,
    workspaceDisplay: getComputedStyle(document.querySelector(".workspace") as Element).display
  }));

  expect(printState).toEqual({
    editorDisplay: "none",
    previewDisplay: "block",
    workspaceDisplay: "block"
  });
});

test("huge documents pause live preview and block stale preview actions", async ({ page }) => {
  await page.goto("/");
  await seedDraft(page, `# Huge\n\n${"a".repeat(200_001)}`);
  await page.reload();

  await expect(page.locator(".statusbar")).toContainText("Live preview paused: document is too large");
  await expect(page.locator(".markdown-preview")).toContainText("Live preview paused: document is too large");
  await expect(page.locator(".cm-content")).toBeVisible();

  await page.getByRole("button", { name: "Copy sanitized HTML" }).click();
  await expect(page.locator(".statusbar")).toContainText("Preview is not ready yet");

  await page.evaluate(() => {
    (window as Window & { __printCalled?: boolean }).__printCalled = false;
    window.print = () => {
      (window as Window & { __printCalled?: boolean }).__printCalled = true;
    };
  });
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect(page.locator(".statusbar")).toContainText("Preview is not ready yet");
  await expect.poll(() => page.evaluate(() => (window as Window & { __printCalled?: boolean }).__printCalled)).toBe(false);
});

test("worker and browser API failures show recoverable status", async ({ page }) => {
  await page.addInitScript(() => {
    class BrokenWorker {
      constructor() {
        throw new Error("Worker blocked");
      }
    }

    Object.defineProperty(window, "Worker", { value: BrokenWorker });
  });

  await page.goto("/");
  await expect(page.locator(".statusbar")).toContainText("Render unavailable");
  await expect(page.locator(".markdown-preview")).toContainText("Render unavailable");
});

test("storage write failure keeps editor state visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".statusbar")).toContainText(/Rendered in \d+ ms/);

  await page.evaluate(() => {
    IDBFactory.prototype.open = () => {
      throw new Error("Quota exceeded");
    };
  });

  await replaceEditorText(page, "# Unsaved\n\nStill in memory");

  await expect(page.locator(".statusbar")).toContainText("Not saved locally");
  await expect(page.locator(".cm-content")).toContainText("Still in memory");
  await expect(page.locator(".markdown-preview h1")).toHaveText("Unsaved");
});

test("clipboard and print failures are reported", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () => Promise.reject(new Error("denied"))
      },
      configurable: true
    });
    window.print = () => {
      throw new Error("print blocked");
    };
  });

  await page.goto("/");
  await expect(page.locator(".statusbar")).toContainText(/Rendered in \d+ ms/);

  await page.getByRole("button", { name: "Copy Markdown source" }).click();
  await expect(page.locator(".statusbar")).toContainText("Clipboard unavailable");

  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect(page.locator(".statusbar")).toContainText("Print unavailable");
});

test("preview links keep app tab safe while internal anchors stay local", async ({ page }) => {
  await page.goto("/");
  await replaceEditorText(page, "# Link\n\n[External](https://example.com/)\n\n[Jump](#link)");
  const previewTab = page.getByRole("button", { name: "Preview" });

  if (await previewTab.isVisible()) {
    await previewTab.click();
  }

  await expect(page.locator(".markdown-preview h1")).toHaveText("Link");

  const externalLink = page.locator(".markdown-preview a", { hasText: "External" });
  await expect(externalLink).toHaveAttribute("target", "_blank");
  await expect(externalLink).toHaveAttribute("rel", "noopener noreferrer");

  const popupPromise = page.waitForEvent("popup");
  await externalLink.click();
  const popup = await popupPromise;
  await popup.close();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".statusbar")).toBeVisible();

  const internalLink = page.locator(".markdown-preview a", { hasText: "Jump" });
  await expect(internalLink).not.toHaveAttribute("target", "_blank");
  await internalLink.click();
  expect(page.url()).toContain("#link");
});

test("two tabs detect draft conflicts and require explicit reload or overwrite", async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.goto("/");
  await pageB.goto("/");
  await replaceEditorText(pageA, "# From A");
  await waitForDraft(pageA, "# From A");

  await replaceEditorText(pageB, "# From B");
  await expect(pageB.locator(".statusbar")).toContainText("Draft changed in another tab");

  await pageB.getByRole("button", { name: "Reload" }).click();
  await expect(pageB.locator(".statusbar")).toContainText("Reload remote draft?");
  await pageB.getByRole("button", { name: "Cancel" }).click();
  await expect(pageB.locator(".cm-content")).toContainText("From B");

  await pageB.getByRole("button", { name: "Overwrite" }).click();
  await expect(pageB.locator(".statusbar")).toContainText("Draft overwritten");
  await waitForDraft(pageB, "# From B");

  await pageA.close();
  await pageB.close();
});

test("same-content revision conflicts are accepted without user conflict", async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", {
      value: undefined,
      configurable: true
    });
  });

  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.goto("/");
  await pageB.goto("/");
  await replaceEditorText(pageA, "# Same");
  await waitForDraft(pageA, "# Same");

  await replaceEditorText(pageB, "# Same");
  await expect(pageB.locator(".statusbar")).not.toContainText("Draft changed in another tab", { timeout: 1000 });
  await expect(pageB.locator(".statusbar")).toContainText("Saved");

  await pageA.close();
  await pageB.close();
});

test("mobile view modes keep panes full width and chrome visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Markdown", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Split", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview", exact: true })).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".statusbar")).toBeVisible();

  const topbarControlsOverflow = await page.locator(".topbar-controls").evaluate((controls) => ({
    clientWidth: controls.clientWidth,
    scrollWidth: controls.scrollWidth
  }));
  const toolbarOverflow = await page.locator(".toolbar").evaluate((toolbar) => ({
    clientWidth: toolbar.clientWidth,
    scrollWidth: toolbar.scrollWidth
  }));

  expect(topbarControlsOverflow.scrollWidth).toBeLessThanOrEqual(topbarControlsOverflow.clientWidth + 1);
  expect(toolbarOverflow.scrollWidth).toBeLessThanOrEqual(toolbarOverflow.clientWidth + 1);

  const workspaceBox = await page.locator(".workspace").boundingBox();
  const editorBox = await page.locator(".editor-pane").boundingBox();

  expect(workspaceBox).not.toBeNull();
  expect(editorBox).not.toBeNull();
  expect(Math.round(editorBox!.width)).toBe(Math.round(workspaceBox!.width));
  expect(workspaceBox!.height).toBeGreaterThan(500);

  await page.getByRole("button", { name: "Preview", exact: true }).click();

  await expect(page.locator(".preview-pane")).toBeVisible();
  await expect(page.locator(".editor-pane")).toBeHidden();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".statusbar")).toBeVisible();

  const previewBox = await page.locator(".preview-pane").boundingBox();

  expect(previewBox).not.toBeNull();
  expect(Math.round(previewBox!.width)).toBe(Math.round(workspaceBox!.width));
});

test("desktop and mobile view modes expose the expected panes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  await expect(page.locator(".editor-pane")).toBeVisible();
  await expect(page.locator(".preview-pane")).toBeVisible();
  await expect(page.getByRole("separator", { name: "Resize Markdown and Preview panes" })).toBeVisible();

  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.locator(".editor-pane")).toBeVisible();
  await expect(page.locator(".preview-pane")).toBeHidden();

  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.locator(".editor-pane")).toBeVisible();
  await expect(page.locator(".preview-pane")).toBeVisible();

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.locator(".editor-pane")).toBeHidden();
  await expect(page.locator(".preview-pane")).toBeVisible();
  const sidebarBox = await page.locator(".workspace-sidebar").boundingBox();
  const previewBox = await page.locator(".preview-pane").boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(Math.round(sidebarBox!.x + sidebarBox!.width)).toBeLessThanOrEqual(Math.round(previewBox!.x));

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Split", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.locator(".editor-pane")).toBeVisible();
  await expect(page.locator(".preview-pane")).toBeHidden();
});

test("color scheme picker applies popular IDE schemes and persists the choice", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "github-light");
  await page.locator(".scheme-picker summary").click();

  const schemeOptions = page.getByRole("menuitemradio");

  await expect(schemeOptions).toHaveCount(19);
  await expect(page.getByRole("menuitemradio", { name: "VS Code Dark+" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "One Dark Pro" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Dracula" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Catppuccin Mocha" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Monokai" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Solarized Light" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Nord" })).toBeVisible();

  await page.getByRole("menuitemradio", { name: "Dracula" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dracula");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await waitForPreferences(page, { colorScheme: "dracula", theme: "dark" });

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dracula");
  await expect(page.locator(".scheme-picker summary")).toContainText("Dracula");
});

test("caret and selected text remain visible on the active editor line in light and dark schemes", async ({ page }) => {
  await page.goto("/");
  await replaceEditorText(page, "# Selection\n\nHighlight me");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

  await expect(page.locator(".cm-selectionBackground").first()).toBeVisible();
  const lightSelectionState = await editorVisibilityColors(page);
  expect(lightSelectionState.selection).not.toBe("rgba(0, 0, 0, 0)");
  expect(lightSelectionState.selection).not.toBe(lightSelectionState.activeLine);
  expect(lightSelectionState.selectedTextContrast).toBeGreaterThanOrEqual(4.5);
  expect(lightSelectionState.cursorContrast).toBeGreaterThanOrEqual(3);

  await page.locator(".scheme-picker summary").click();
  await page.getByRole("menuitemradio", { name: "Dracula" }).click();
  await replaceEditorText(page, "# Dark selection\n\nHighlight me too");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

  await expect(page.locator(".cm-selectionBackground").first()).toBeVisible();
  const darkSelectionState = await editorVisibilityColors(page);
  expect(darkSelectionState.selection).not.toBe("rgba(0, 0, 0, 0)");
  expect(darkSelectionState.selection).not.toBe(darkSelectionState.activeLine);
  expect(darkSelectionState.selectionActiveLineDistance).toBeGreaterThanOrEqual(32);
  expect(darkSelectionState.selectedTextContrast).toBeGreaterThanOrEqual(4.5);
  expect(darkSelectionState.cursorContrast).toBeGreaterThanOrEqual(3);
});

test("sidebar file manager creates, switches, removes, and preserves file contents", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Untitled draft", exact: true })).toBeVisible();

  await replaceEditorText(page, "# First file\n\nOriginal content");
  await waitForDraft(page, "# First file\n\nOriginal content");

  await page.getByRole("button", { name: "New file" }).click();
  await expect(page.getByRole("button", { name: "New file 2", exact: true })).toBeVisible();
  await replaceEditorText(page, "# Second file\n\nNew content");
  await waitForDraft(page, "# Second file\n\nNew content");

  await page.getByRole("button", { name: "New file 2", exact: true }).dblclick();
  await expect(page.getByLabel("Rename New file 2")).toBeVisible();
  await page.getByLabel("Rename New file 2").fill("Second renamed");
  await page.getByRole("button", { name: "Save file name" }).click();
  await expect(page.getByRole("button", { name: "Second renamed", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Second renamed", exact: true }).dblclick();
  await expect(page.getByLabel("Rename Second renamed")).toBeVisible();
  await page.getByLabel("Rename Second renamed").fill("Cancelled name");
  await page.getByRole("button", { name: "Cancel rename" }).click();
  await expect(page.getByRole("button", { name: "Second renamed", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelled name", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Untitled draft", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("Original content");
  await expect(page.locator(".markdown-preview h1")).toHaveText("First file");

  await page.getByRole("button", { name: "Second renamed", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("New content");
  await expect(page.locator(".markdown-preview h1")).toHaveText("Second file");

  await page.getByRole("button", { name: "Delete Second renamed" }).click();
  await expect(page.getByRole("button", { name: "Second renamed", exact: true })).toHaveCount(0);
  await expect(page.locator(".cm-content")).toContainText("Original content");
  await expect(page.locator(".markdown-preview h1")).toHaveText("First file");
});

test("rapid typing saves the final markdown without a false conflict", async ({ page }) => {
  await page.goto("/");
  await replaceEditorText(page, "# Rapid\n\nf");
  await replaceEditorText(page, "# Rapid\n\nfinal");
  await replaceEditorText(page, "# Rapid\n\nfinal markdown");

  await waitForDraft(page, "# Rapid\n\nfinal markdown");
  await expect(page.locator(".statusbar")).not.toContainText("Draft changed in another tab");
});

test("reload during pending autosave restores the latest active draft", async ({ page }) => {
  const draft = "# Reload race\n\nLatest unsaved text";

  await page.goto("/");
  await replaceEditorText(page, draft);
  await page.reload();

  await expect(page.locator(".cm-content")).toContainText("Latest unsaved text");
  await expect(page.locator(".markdown-preview h1")).toHaveText("Reload race");
  await waitForDraft(page, draft);
});

test("reverting to loaded markdown before autosave does not save stale intermediate text", async ({ page }) => {
  const original = "# Revert base\n\nStable";

  await page.goto("/");
  await replaceEditorText(page, original);
  await waitForDraft(page, original);

  await replaceEditorText(page, "# Revert base\n\nTemporary");
  await replaceEditorText(page, original);
  await page.waitForTimeout(900);

  await waitForDraft(page, original);
  await expect(page.locator(".statusbar")).toContainText("Saved");
  await expect(page.locator(".statusbar")).not.toContainText("Saving");
});

async function waitForDraft(page: Page, expected: string): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return new Promise<string | null>((resolve, reject) => {
          const request = indexedDB.open("live-markdown-preview", 1);

          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("app", "readonly");
            const store = transaction.objectStore("app");
            const activeRequest = store.get("activeFileId");

            activeRequest.onsuccess = () => {
              const activeFileId = typeof activeRequest.result === "string" ? activeRequest.result : "legacy-draft";
              const fileRequest = store.get(`files/${activeFileId}`);

              fileRequest.onsuccess = () => {
                const value = fileRequest.result as { markdown?: string } | undefined;

                resolve(value?.markdown ?? null);
                database.close();
              };
              fileRequest.onerror = () => {
                database.close();
                reject(fileRequest.error);
              };
            };
            activeRequest.onerror = () => {
              database.close();
              reject(activeRequest.error);
            };
          };
        });
      });
    })
    .toBe(expected);
}

async function replaceEditorText(page: Page, text: string): Promise<void> {
  await page.locator(".cm-content").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(text);
}

async function editorVisibilityColors(page: Page): Promise<{
  activeLine: string;
  cursor: string;
  cursorContrast: number;
  selection: string;
  selectionActiveLineDistance: number;
  selectedTextContrast: number;
}> {
  return page.evaluate(() => {
    type Rgba = { a: number; b: number; g: number; r: number };

    const parseColor = (value: string): Rgba => {
      const [r = 0, g = 0, b = 0, a = 1] = value.match(/[\d.]+/g)?.map(Number) ?? [];

      return { a, b, g, r };
    };
    const composite = (foreground: Rgba, background: Rgba): Rgba => ({
      a: 1,
      b: foreground.b * foreground.a + background.b * (1 - foreground.a),
      g: foreground.g * foreground.a + background.g * (1 - foreground.a),
      r: foreground.r * foreground.a + background.r * (1 - foreground.a)
    });
    const channelLuminance = (value: number) => {
      const normalized = value / 255;

      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (color: Rgba) =>
      0.2126 * channelLuminance(color.r) + 0.7152 * channelLuminance(color.g) + 0.0722 * channelLuminance(color.b);
    const contrast = (first: Rgba, second: Rgba) => {
      const lighter = Math.max(luminance(first), luminance(second));
      const darker = Math.min(luminance(first), luminance(second));

      return (lighter + 0.05) / (darker + 0.05);
    };
    const distance = (first: Rgba, second: Rgba) =>
      Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);

    const editor = document.querySelector(".cm-editor") as Element;
    const line = document.querySelector(".cm-line") as Element;
    const cursor = document.querySelector(".cm-cursor") as Element;
    const activeLine = document.querySelector(".cm-activeLine") as Element;
    const selection = document.querySelector(".cm-selectionBackground") as Element;
    const editorBackground = parseColor(getComputedStyle(editor).backgroundColor);
    const textColor = parseColor(getComputedStyle(line).color);
    const cursorColor = parseColor(getComputedStyle(cursor).borderLeftColor);
    const activeLineBackground = parseColor(getComputedStyle(activeLine).backgroundColor);
    const selectionBackground = parseColor(getComputedStyle(selection).backgroundColor);
    const activeLineComposite = composite(activeLineBackground, editorBackground);
    const selectionComposite = composite(selectionBackground, editorBackground);

    return {
      activeLine: getComputedStyle(activeLine).backgroundColor,
      cursor: getComputedStyle(cursor).borderLeftColor,
      cursorContrast: contrast(cursorColor, editorBackground),
      selection: getComputedStyle(selection).backgroundColor,
      selectionActiveLineDistance: distance(selectionComposite, activeLineComposite),
      selectedTextContrast: contrast(textColor, selectionComposite)
    };
  });
}

async function seedDraft(page: Page, markdown: string): Promise<void> {
  await page.evaluate((value) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("live-markdown-preview", 1);

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("app")) {
          request.result.createObjectStore("app");
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app", "readwrite");
        const store = transaction.objectStore("app");
        const activeRequest = store.get("activeFileId");

        activeRequest.onsuccess = () => {
          const activeFileId = typeof activeRequest.result === "string" ? activeRequest.result : "legacy-draft";

          store.put(
            {
              version: 1,
              id: activeFileId,
              title: "Seeded draft",
              markdown: value,
              revision: 1,
              updatedAt: Date.now(),
              clientId: "seed"
            },
            `files/${activeFileId}`
          );
          store.put([activeFileId], "files/index");
          store.put(activeFileId, "activeFileId");
        };
        activeRequest.onerror = () => {
          database.close();
          reject(activeRequest.error);
        };
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
      };
    });
  }, markdown);
}

async function waitForPreferences(
  page: Page,
  expected: { colorScheme?: string; outlineVisible?: boolean; splitRatio?: number; theme?: string }
): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return new Promise<{ colorScheme?: string; outlineVisible?: boolean; splitRatio?: number; theme?: string } | null>((resolve, reject) => {
          const request = indexedDB.open("live-markdown-preview", 1);

          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("app", "readonly");
            const getRequest = transaction.objectStore("app").get("preferences");

            getRequest.onsuccess = () => {
              resolve(
                (getRequest.result as { colorScheme?: string; outlineVisible?: boolean; splitRatio?: number; theme?: string } | undefined) ??
                  null
              );
              database.close();
            };
            getRequest.onerror = () => {
              database.close();
              reject(getRequest.error);
            };
          };
        });
      });
    })
    .toMatchObject(expected);
}

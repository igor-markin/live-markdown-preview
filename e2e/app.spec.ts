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

  await page.getByRole("button", { name: "Copy Markdown" }).click();
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

test("desktop layout keeps chrome visible, hides outline, and persists split ratio", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/");

  await expect(page.locator(".markdown-preview h1")).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".statusbar")).toBeVisible();
  await expect(page.locator(".statusbar")).not.toHaveAttribute("aria-live", "polite");
  await expect(page.locator(".statusbar")).toContainText(/Rendered in \d+ ms/);
  await expect(page.getByRole("button", { name: "Templates" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Safe Beautify Markdown" })).toHaveCount(0);

  const toolbarOrder = await page.locator(".toolbar").evaluate((toolbar) =>
    Array.from(toolbar.children).map((element) => element.getAttribute("aria-label") ?? "separator")
  );

  expect(toolbarOrder).toEqual([
    "Undo",
    "Redo",
    "separator",
    "Hide Outline",
    "separator",
    "Copy Markdown",
    "Copy sanitized HTML",
    "separator",
    "Export PDF",
    "separator",
    "About",
    "Open GitHub repository",
    "separator",
    "Toggle Theme"
  ]);
  expect(await page.locator(".toolbar-separator").count()).toBe(5);

  await expect(page.locator(".editor-pane .outline")).toBeVisible();
  await expect(page.locator(".preview-pane .outline")).toHaveCount(0);

  const outlineBox = await page.locator(".editor-pane .outline").boundingBox();
  const editorShellBox = await page.locator(".editor-shell").boundingBox();
  expect(outlineBox?.x ?? 0).toBeLessThan(editorShellBox?.x ?? 0);

  await page.getByRole("button", { name: "Hide Outline" }).click();
  await expect(page.locator(".editor-pane .outline")).toHaveCount(0);
  await expect(page.locator(".statusbar")).toContainText("Outline hidden");
  await expect(page.locator(".action-status")).toContainText("Outline hidden");

  const splitter = page.getByRole("separator", { name: "Resize Markdown and Preview panes" });
  await expect(splitter).toHaveCSS("cursor", "col-resize");
  const splitterBox = await splitter.boundingBox();
  expect(splitterBox).not.toBeNull();

  await page.mouse.move(splitterBox!.x + splitterBox!.width / 2, splitterBox!.y + splitterBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(splitterBox!.x + splitterBox!.width / 2 + 140, splitterBox!.y + splitterBox!.height / 2);
  await page.mouse.up();

  const splitAfterDrag = Number(await splitter.getAttribute("aria-valuenow"));
  expect(splitAfterDrag).toBeGreaterThan(50);
  await waitForPreferences(page, { outlineVisible: false, splitRatio: splitAfterDrag });

  await page.locator(".preview-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator(".topbar")).toBeInViewport();
  await expect(page.locator(".statusbar")).toBeInViewport();

  await page.reload();
  await expect(page.locator(".editor-pane .outline")).toHaveCount(0);
  await expect(splitter).toHaveAttribute("aria-valuenow", String(splitAfterDrag));

  await splitter.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(splitAfterDrag - 2));
  await waitForPreferences(page, { outlineVisible: false, splitRatio: splitAfterDrag - 2 });
});

test("about and PDF export actions work", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      (window as Window & { __printCalled?: boolean }).__printCalled = true;
    };
  });

  await page.goto("/");

  await page.getByRole("button", { name: "About" }).click();
  await expect(page.getByRole("dialog", { name: "About" })).toContainText("Igor Markin");
  await expect(page.getByRole("link", { name: "GitHub repository", exact: true })).toHaveAttribute(
    "href",
    "https://github.com/igor-markin/live-markdown-preview"
  );
  await page.getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("link", { name: "Open GitHub repository" })).toHaveAttribute(
    "href",
    "https://github.com/igor-markin/live-markdown-preview"
  );

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

  await page.getByRole("button", { name: "Copy Markdown" }).click();
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

test("modal traps focus, closes with Escape, and restores opener focus", async ({ page }) => {
  await page.goto("/");

  const aboutButton = page.getByRole("button", { name: "About" });
  await aboutButton.click();

  const dialog = page.getByRole("dialog", { name: "About" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "GitHub repository" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(aboutButton).toBeFocused();
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

test("mobile mode switches between editor and preview", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");

  await expect(page.locator(".editor-pane")).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".statusbar")).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator(".preview-pane")).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".statusbar")).toBeVisible();
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
            const getRequest = transaction.objectStore("app").get("draft");

            getRequest.onsuccess = () => {
              const value = getRequest.result as string | { markdown?: string } | undefined;

              if (typeof value === "string") {
                resolve(value);
              } else {
                resolve(value?.markdown ?? null);
              }
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
    .toBe(expected);
}

async function replaceEditorText(page: Page, text: string): Promise<void> {
  await page.locator(".cm-content").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(text);
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

        transaction.objectStore("app").put(
          {
            version: 2,
            markdown: value,
            revision: 1,
            updatedAt: Date.now(),
            clientId: "seed"
          },
          "draft"
        );
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
  expected: { outlineVisible: boolean; splitRatio: number }
): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return new Promise<{ outlineVisible?: boolean; splitRatio?: number } | null>((resolve, reject) => {
          const request = indexedDB.open("live-markdown-preview", 1);

          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("app", "readonly");
            const getRequest = transaction.objectStore("app").get("preferences");

            getRequest.onsuccess = () => {
              resolve((getRequest.result as { outlineVisible?: boolean; splitRatio?: number } | undefined) ?? null);
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

import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

const demoUrl = "http://127.0.0.1:4174/";
const sampleHtml = `
  <main style="padding:20px">
    <div id="scroller" style="height:140px;overflow:auto">
      <div style="height:180px"></div>
      <h2 style="margin:0;width:180px;height:60px">Editable target</h2>
      <div style="height:180px"></div>
    </div>
  </main>`;

async function importSample(page: Page): Promise<void> {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Import HTML" }).click();
  await page.getByLabel("HTML").fill(sampleHtml);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.locator('iframe[title="Imported HTML document"]')).toBeVisible();
}

async function importHtml(page: Page, html: string): Promise<void> {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Import HTML" }).click();
  await page.getByLabel("HTML").fill(html);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.locator('iframe[title="Imported HTML document"]')).toBeVisible();
}

async function exportedHtml(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export HTML" }).click();
  const path = await (await downloadPromise).path();
  if (!path) throw new Error("Exported HTML download is unavailable");
  return readFile(path, "utf8");
}

async function expectVisibleFocusOutline(control: Locator): Promise<void> {
  const outline = await control.evaluate((element) => {
    const style = element.ownerDocument.defaultView!.getComputedStyle(element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThan(0);
}

async function expectReadableTextContrast(control: Locator): Promise<void> {
  const contrast = await control.evaluate((element) => {
    const style = element.ownerDocument.defaultView!.getComputedStyle(element);
    const luminance = (color: string): number => {
      const channels = color
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
      if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${color}`);
      const [red, green, blue] = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

test("loads rich text through the package boundary without demo implementation modules", async ({
  page,
  request,
}) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  await page.locator('[data-editor-node-id="element-1"]').dblclick();
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();

  for (const module of ["rich-text-editor.ts", "rich-text-menu.ts"]) {
    const response = await request.get(`${demoUrl}src/${module}`);
    expect(response.headers()["content-type"]).toContain("text/html");
  }
});

test("drags HTML in real time with its selection overlay", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const node = page.getByLabel("Node element-1");
  const before = await node.boundingBox();
  if (!before) throw new Error("HTML node is not visible");

  await page.mouse.move(before.x + 30, before.y + 30);
  await page.mouse.down();
  await page.mouse.move(before.x + 90, before.y + 70);

  const preview = await node.boundingBox();
  const overlay = await page.locator("[data-selection-overlay]").boundingBox();
  expect(preview?.x).toBeCloseTo(before.x + 60, 0);
  expect(preview?.y).toBeCloseTo(before.y + 40, 0);
  expect(Math.abs((overlay?.x ?? 0) - (preview?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((overlay?.y ?? 0) - (preview?.y ?? 0))).toBeLessThanOrEqual(1);
  await page.mouse.up();
});

test("resizes HTML in real time", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const node = page.getByLabel("Node element-1");
  await node.click();
  const handle = page.getByRole("button", { name: "Resize south-east" });
  const before = await node.boundingBox();
  const handleBox = await handle.boundingBox();
  if (!before || !handleBox) throw new Error("HTML resize controls are not visible");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 50, handleBox.y + 35);
  await expect
    .poll(async () => (await node.boundingBox())?.width)
    .toBeCloseTo(before.width + 44, 0);
  await expect
    .poll(async () => (await node.boundingBox())?.height)
    .toBeCloseTo(before.height + 29, 0);
  await page.mouse.up();
});

test("edits HTML text", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await expect(content.locator(".ProseMirror")).toHaveAttribute("contenteditable", "true");
  await expect(content).toHaveText("Element 1");
  await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await content.pressSequentially("Updated HTML node");
  await page.locator("[data-canvas]").click({ position: { x: 2, y: 2 } });
  await expect(content).toHaveText("Updated HTML node");
  await expect(content.locator(".ProseMirror")).toHaveCount(0);
});

test("starts rich text editing without duplicate extension warnings", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  await page.locator('[data-editor-node-id="element-1"]').dblclick();

  expect(warnings.filter((warning) => warning.includes("Duplicate extension names"))).toEqual([]);
});

test("formats a selected range in a regular node", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

  const menu = page.getByRole("toolbar", { name: "Text formatting" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Bold" }).click();
  await page.locator("[data-canvas]").click({ position: { x: 2, y: 2 } });

  await expect(content.locator("strong")).toHaveText("Element 1");
});

test("formats a selected range inside imported HTML", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await importSample(page);
  const target = page.frameLocator("iframe").getByRole("heading", { name: "Editable target" });
  await target.dblclick();
  await target.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

  const menu = page.frameLocator("iframe").getByRole("toolbar", { name: "Text formatting" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Italic" }).click();
  await page.locator(".stage-heading").click();

  expect(pageErrors).toEqual([]);
  await expect(menu).toHaveCount(0);
  await expect(target.locator("em")).toHaveText("Editable target");
  await expect(target.locator(":scope > p")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export HTML" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Exported HTML download is unavailable");
  const html = await readFile(path, "utf8");
  expect(html).toMatch(/<h2[^>]*><em>Editable target<\/em><\/h2>/);
  expect(html).not.toMatch(/<h2[^>]*><p>/);
});

for (const host of ["p", "a"] as const) {
  test(`keeps formatting inline when editing an imported leaf <${host}>`, async ({ page }) => {
    const attributes = host === "a" ? ' href="/docs"' : "";
    await importHtml(page, `<${host}${attributes}>Leaf content</${host}>`);
    const target = page
      .frameLocator("iframe")
      .locator(`${host}[data-muscat-node-id]`)
      .filter({ hasText: "Leaf content" });
    await target.dblclick();
    await target.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page
      .frameLocator("iframe")
      .getByRole("toolbar", { name: "Text formatting" })
      .getByRole("button", { name: "Bold" })
      .click();
    await page.locator(".stage-heading").click();

    await expect(target.locator(":scope > p")).toHaveCount(0);
    await expect(target.locator(":scope > strong")).toHaveText("Leaf content");
    await expect(target).toHaveText("Leaf content");
    const html = await exportedHtml(page);
    expect(html).not.toMatch(new RegExp(`<${host}[^>]*>\\s*<p>`));
    expect(html.match(/Leaf content/g)).toHaveLength(1);
  });
}

test("does not create nested links while editing a standalone anchor host", async ({ page }) => {
  await importHtml(page, '<a href="/original">Anchor content</a>');
  const frame = page.frameLocator("iframe");
  const target = frame.locator("a[data-muscat-node-id]");
  await target.dblclick();
  await target.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  const menu = frame.getByRole("toolbar", { name: "Text formatting" });
  await expect(menu.getByRole("button", { name: "Link" })).toBeDisabled();
  await menu.getByRole("button", { name: "Bold" }).click();
  await target.press("End");
  await page.keyboard.insertText(" https://example.com/new");
  await page.keyboard.press("Space");
  await page.locator(".stage-heading").click();

  await expect(target.locator("a")).toHaveCount(0);
  await expect(target.locator("strong")).toContainText("https://example.com/new");
  const html = await exportedHtml(page);
  expect(html).not.toMatch(/<a[^>]*>[^]*<a/i);
  expect(html.match(/<a\b/gi)).toHaveLength(1);
});

test("cancels an imported paragraph edit without adding wrappers or duplicate content", async ({
  page,
}) => {
  await importHtml(page, "<p>Original paragraph</p>");
  const target = page.frameLocator("iframe").locator("p[data-muscat-node-id]");
  await target.dblclick();
  await target.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await target.pressSequentially("Cancelled change");
  await target.press("Escape");

  await expect(target).toHaveText("Original paragraph");
  await expect(target.locator(":scope > p")).toHaveCount(0);
  const html = await exportedHtml(page);
  expect(html.match(/Original paragraph/g)).toHaveLength(1);
  expect(html).not.toMatch(/<p[^>]*>\s*<p>/);
});

test("adopts rich text styles into an iframe and removes them after editing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importHtml(page, '<main><p style="width:180px">Styled target</p></main>');
  const frame = page.frameLocator("iframe");
  const target = frame.locator("p[data-muscat-node-id]").filter({ hasText: "Styled target" });
  await target.dblclick();
  await target.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  const menu = frame.getByRole("toolbar", { name: "Text formatting" });
  const bold = menu.getByRole("button", { name: "Bold" });

  await expect(menu).toHaveCSS("background-color", "rgb(37, 37, 37)");
  await expect(bold).toHaveCSS("width", "32px");
  await expect(bold).toHaveCSS("height", "32px");
  await bold.focus();
  await expectVisibleFocusOutline(bold);
  await expectReadableTextContrast(bold);
  const bounds = await menu.boundingBox();
  if (!bounds) throw new Error("Iframe toolbar is not visible");
  const frameViewportWidth = await menu.evaluate(
    (element) => element.ownerDocument.documentElement.clientWidth,
  );
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(frameViewportWidth);

  await page.keyboard.press("Escape");
  await expect(frame.locator("style[data-muscat-rich-text-style]")).toHaveCount(0);
  await target.dblclick();
  await expect(frame.locator("style[data-muscat-rich-text-style]")).toHaveCount(1);
  await target.press("Escape");
});

test("does not adopt or delete a colliding imported rich text style", async ({ page }) => {
  await importHtml(
    page,
    `<style data-muscat-rich-text-style>
      .rich-text-menu { background: rgb(255, 0, 0); }
      .rich-text-menu__button { width: 3px; height: 3px; }
    </style><p>Collision target</p>`,
  );
  const frame = page.frameLocator("iframe");
  const importedStyle = frame.locator("style[data-muscat-rich-text-style]");
  const target = frame.locator("p[data-muscat-node-id]").filter({ hasText: "Collision target" });
  await expect(importedStyle).toHaveCount(1);
  await target.dblclick();
  await target.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  const menu = frame.getByRole("toolbar", { name: "Text formatting" });
  const bold = menu.getByRole("button", { name: "Bold" });

  await expect(frame.locator("style[data-muscat-rich-text-style]")).toHaveCount(2);
  await expect(menu).toHaveCSS("background-color", "rgb(37, 37, 37)");
  await expect(bold).toHaveCSS("width", "32px");
  await expect(bold).toHaveCSS("height", "32px");
  await target.press("Escape");
  await expect(importedStyle).toHaveCount(1);

  await target.dblclick();
  await expect(frame.locator("style[data-muscat-rich-text-style]")).toHaveCount(2);
  await target.press("Escape");
  await expect(importedStyle).toHaveCount(1);
});

test("cleans up when the active imported node is removed", async ({ page }) => {
  await importHtml(page, "<p>Removed while editing</p>");
  const frame = page.frameLocator("iframe");
  const target = frame.getByText("Removed while editing", { exact: true });
  await target.dblclick();
  await expect(page.locator("[data-canvas]")).toHaveClass(/is-rich-text-editing/);

  await page
    .getByRole("button", { name: "Undo" })
    .evaluate((button: HTMLButtonElement) => button.click());

  await expect(page.locator("[data-canvas]")).not.toHaveClass(/is-rich-text-editing/);
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toHaveCount(0);
  await expect(page.locator('iframe[title="Imported HTML document"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-canvas]")).not.toHaveClass(/is-rich-text-editing/);
});

test("commits an iframe edit on an outside iframe pointer without selecting it", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await importSample(page);
  const frame = page.frameLocator("iframe");
  const target = frame.locator("h2");
  await target.dblclick();
  await target.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await target.pressSequentially("Committed in iframe");
  await expect(target).toContainText("Committed in iframe");
  await expect(page.locator("[data-canvas]")).toHaveClass(/is-rich-text-editing/);

  await frame.locator("main").click({ position: { x: 4, y: 4 } });

  await expect(frame.getByRole("toolbar", { name: "Text formatting" })).toHaveCount(0);
  await expect(target).toHaveText("Committed in iframe");
  await expect(page.locator("[data-selection-overlay] .selection-label")).toHaveText("h2");
  expect(pageErrors).toEqual([]);
});

test("cancels an iframe edit with Escape from the link input", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await importSample(page);
  const frame = page.frameLocator("iframe");
  const target = frame.locator("h2");
  await target.dblclick();
  await target.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  const menu = frame.getByRole("toolbar", { name: "Text formatting" });
  await menu.getByRole("button", { name: "Link" }).click();
  const input = menu.getByLabel("URL");
  await input.fill("https://example.com/cancelled");
  await expect(page.locator("[data-canvas]")).toHaveClass(/is-rich-text-editing/);

  await input.press("Escape");

  await expect(menu).toHaveCount(0);
  await expect(target).toHaveText("Editable target");
  await expect(page.locator("[data-canvas]")).not.toHaveClass(/is-rich-text-editing/);
  expect(pageErrors).toEqual([]);
});

test("applies regular node marks and alignment", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  const menu = page.getByRole("toolbar", { name: "Text formatting" });

  for (const name of ["Italic", "Underline", "Strike"]) {
    await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await menu.getByRole("button", { name }).click();
  }
  await menu.getByRole("button", { name: "Align center" }).click();
  await expect(content.locator("p")).toHaveCSS("text-align", "center");
  await menu.getByRole("button", { name: "Align left" }).click();
  await expect(content.locator("p")).toHaveCSS("text-align", "left");
  await menu.getByRole("button", { name: "Align right" }).click();
  await expect(content.locator("p")).toHaveCSS("text-align", "right");
  await page.locator("[data-canvas]").click({ position: { x: 2, y: 2 } });

  await expect(content.locator("em")).toHaveText("Element 1");
  await expect(content.locator("u")).toHaveText("Element 1");
  await expect(content.locator("s")).toHaveText("Element 1");
  await expect(content.locator("p")).toHaveCSS("text-align", "right");
});

test("applies, rejects, and removes links in a regular node", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await content.evaluate((element) => {
    const text = element.querySelector(".ProseMirror p")?.firstChild;
    if (!text) throw new Error("Editable text was not found");
    const selection = element.ownerDocument.getSelection();
    const range = element.ownerDocument.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 7);
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  });
  const menu = page.getByRole("toolbar", { name: "Text formatting" });
  await menu.getByRole("button", { name: "Link" }).click();
  const input = menu.getByLabel("URL");
  await input.fill("javascript:alert(1)");
  await menu.getByRole("button", { name: "Apply link" }).click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(content.locator("a")).toHaveCount(0);

  await input.fill("https://example.com/docs");
  await menu.getByRole("button", { name: "Apply link" }).click();
  const link = content.locator("a");
  await expect(link).toHaveText("Element");
  await expect(link).toHaveAttribute("href", "https://example.com/docs");
  await expect(link).not.toHaveAttribute("target", /.+/);
  await expect(link).not.toHaveAttribute("rel", /.+/);
  await expect(content.locator("p")).toHaveText("Element 1");
  await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await menu.getByRole("button", { name: "Link" }).click();
  await menu.getByRole("button", { name: "Remove link" }).click();
  await expect(content.locator("a")).toHaveCount(0);
});

test("keeps an unsafe typed URI as plain text while editing", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await content.pressSequentially("ftp://unsafe.example/file ");

  await expect(content).toContainText("ftp://unsafe.example/file");
  await expect(content.locator("a")).toHaveCount(0);
});

test("cancels rich text editing when Escape is pressed in the link input", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  const menu = page.getByRole("toolbar", { name: "Text formatting" });
  await menu.getByRole("button", { name: "Link" }).click();
  const input = menu.getByLabel("URL");
  await input.fill("https://example.com/cancelled");
  await input.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(content).toHaveText("Element 1");
  await expect(page.locator("[data-canvas]")).not.toHaveClass(/is-rich-text-editing/);
});

test("commits before an outside editor action and tears down the session", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await content.pressSequentially("Committed outside");
  await page.getByRole("button", { name: "Add element" }).click();

  await expect(page.locator('[data-editor-node-id="element-1"]')).toHaveText("Committed outside");
  await expect(page.getByLabel("Node element-2")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toHaveCount(0);
  await expect(page.locator("[data-canvas]")).not.toHaveClass(/is-rich-text-editing/);
});

test("does not add history for a no-op outside commit", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await page.getByRole("button", { name: "Undo" }).focus();
  await expect(page.locator("[data-canvas]")).not.toHaveClass(/is-rich-text-editing/);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Node element-1")).toHaveCount(0);
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  for (const edge of ["default", "top-left", "bottom-right"] as const) {
    test(`keeps the expanded rich text menu inside the ${viewport.width}px viewport near the ${edge} canvas edge`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(demoUrl);
      await page.getByRole("button", { name: "Add element" }).click();
      const node = page.getByLabel("Node element-1");
      await node.evaluate((element, edge) => {
        if (edge === "default") return;
        const parentBounds = element.parentElement!.getBoundingClientRect();
        const left = edge === "top-left" ? 0 : window.innerWidth - parentBounds.left - 180;
        const top = edge === "top-left" ? 0 : window.innerHeight - parentBounds.top - 60;
        element.style.left = `${Math.max(0, left)}px`;
        element.style.top = `${Math.max(0, top)}px`;
        element.style.width = "180px";
        element.style.height = "60px";
      }, edge);
      const content = page.locator('[data-editor-node-id="element-1"]');
      await content.dblclick();
      await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      const menu = page.getByRole("toolbar", { name: "Text formatting" });
      await expect(menu).toBeVisible();
      await menu.getByRole("button", { name: "Link" }).click();
      await expect(menu.getByLabel("URL")).toBeVisible();

      const bounds = await menu.boundingBox();
      if (!bounds) throw new Error("Text formatting toolbar is not visible");
      await expect(menu).toHaveCSS("position", "fixed");
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);

      const controls = [menu.getByLabel("URL"), ...(await menu.getByRole("button").all())];
      const controlBounds = await Promise.all(controls.map((control) => control.boundingBox()));
      for (const rect of controlBounds) {
        if (!rect) throw new Error("An expanded rich text control is not visible");
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
        expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
        expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
        expect(rect.y).toBeGreaterThanOrEqual(bounds.y);
        expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
      for (let first = 0; first < controlBounds.length; first++) {
        for (let second = first + 1; second < controlBounds.length; second++) {
          const a = controlBounds[first]!;
          const b = controlBounds[second]!;
          const doNotOverlap =
            a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y;
          expect(doNotOverlap).toBe(true);
        }
      }
    });
  }
}

test("supports keyboard traversal and preserves the selected range when applying a link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  const menu = page.getByRole("toolbar", { name: "Text formatting" });
  await expect(menu).toBeVisible();

  const bold = menu.getByRole("button", { name: "Bold" });
  for (
    let attempts = 0;
    attempts < 30 &&
    !(await bold.evaluate((element) => element === element.ownerDocument.activeElement));
    attempts++
  ) {
    await page.keyboard.press("Tab");
  }
  for (const name of [
    "Bold",
    "Italic",
    "Underline",
    "Strike",
    "Align left",
    "Align center",
    "Align right",
    "Link",
  ]) {
    const control = menu.getByRole("button", { name });
    await expect(control).toBeFocused();
    await expect(control).toHaveCSS("outline-style", "solid");
    if (name === "Link") break;
    await page.keyboard.press("Tab");
  }

  await page.keyboard.press("Enter");
  const input = menu.getByLabel("URL");
  await expect(input).toBeFocused();
  await expectVisibleFocusOutline(input);
  await input.fill("https://example.com/keyboard");
  await page.keyboard.press("Tab");
  const applyLink = menu.getByRole("button", { name: "Apply link" });
  await expect(applyLink).toBeFocused();
  await expectVisibleFocusOutline(applyLink);
  await expectReadableTextContrast(applyLink);
  await page.keyboard.press("Tab");
  const removeLink = menu.getByRole("button", { name: "Remove link" });
  await expect(removeLink).toBeFocused();
  await expectVisibleFocusOutline(removeLink);
  await expectReadableTextContrast(removeLink);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");

  await expect(content.locator(".ProseMirror")).toBeFocused();
  await expect(content.locator("a")).toHaveText("Element 1");
  await expect(content.locator("a")).toHaveAttribute("href", "https://example.com/keyboard");
});

test("hides the regular node menu for a collapsed selection", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  const menu = page.getByRole("toolbar", { name: "Text formatting" });
  await expect(menu).toBeVisible();
  await content.press("ArrowRight");
  await expect(menu).toBeHidden();
});

test("cancels regular node rich text editing with Escape", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await content.pressSequentially("Cancelled");
  await content.press("Escape");
  await expect(content).toHaveText("Element 1");
  await expect(content).not.toHaveAttribute("contenteditable", /.*/);
});

test("commits regular node rich text as one undo step", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await content.pressSequentially("Committed");
  await page.locator("[data-canvas]").click({ position: { x: 2, y: 2 } });
  await expect(content).toHaveText("Committed");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(content).toHaveText("Element 1");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(content).toHaveText("Committed");
});

test("suppresses regular node dragging while rich text is editing", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const node = page.getByLabel("Node element-1");
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await expect(page.locator("[data-selection-overlay]")).toBeHidden();
  const before = await node.boundingBox();
  if (!before) throw new Error("HTML node is not visible");
  await page.mouse.move(before.x + 30, before.y + 30);
  await page.mouse.down();
  await page.mouse.move(before.x + 90, before.y + 70);
  await page.mouse.up();
  const after = await node.boundingBox();
  expect(after?.x).toBeCloseTo(before.x, 0);
  expect(after?.y).toBeCloseTo(before.y, 0);
  await page.mouse.move(before.x + before.width, before.y + before.height);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width + 50, before.y + before.height + 35);
  await page.mouse.up();
  const afterResizeAttempt = await node.boundingBox();
  expect(afterResizeAttempt?.width).toBeCloseTo(before.width, 0);
  expect(afterResizeAttempt?.height).toBeCloseTo(before.height, 0);
});

test("keeps the HTML selection overlay aligned while an ancestor scrolls", async ({ page }) => {
  await page.goto(demoUrl);
  await page.locator("[data-canvas]").evaluate((canvas) => {
    canvas.style.height = "180px";
    canvas.style.minHeight = "0";
    canvas.style.overflow = "auto";
  });
  for (let index = 0; index < 10; index++) {
    await page.getByRole("button", { name: "Add element" }).click();
  }
  const target = page.getByLabel("Node element-10");
  await target.click();
  const canvas = page.locator("[data-canvas]");
  await canvas.evaluate((element) => (element.scrollTop = 120));
  await expect.poll(async () => await canvas.evaluate((element) => element.scrollTop)).toBe(120);

  const targetBox = await target.boundingBox();
  const overlayBox = await page.locator("[data-selection-overlay]").boundingBox();
  expect(Math.abs((overlayBox?.x ?? 0) - (targetBox?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((overlayBox?.y ?? 0) - (targetBox?.y ?? 0))).toBeLessThanOrEqual(1);
});

test("resizes an iframe element in real time", async ({ page }) => {
  await importSample(page);
  const target = page.frameLocator("iframe").getByText("Editable target");
  await target.click();
  const handle = page.getByRole("button", { name: "Resize south-east" });
  const before = await target.boundingBox();
  const handleBox = await handle.boundingBox();
  if (!before || !handleBox) throw new Error("Iframe resize controls are not visible");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 45, handleBox.y + 35);
  await expect
    .poll(async () => (await target.boundingBox())?.width)
    .toBeGreaterThan(before.width + 30);
  await expect
    .poll(async () => (await target.boundingBox())?.height)
    .toBeGreaterThan(before.height + 20);
  await page.mouse.up();
});

test("imports and exports HTML", async ({ page }) => {
  await importSample(page);
  await expect(page.frameLocator("iframe").getByText("Editable target")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export HTML" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("muscat-export.html");
  const path = await download.path();
  if (!path) throw new Error("Exported HTML download is unavailable");
  const html = await readFile(path, "utf8");
  expect(html).toContain("Editable target");
  expect(html).not.toContain("data-muscat-node-id");
});

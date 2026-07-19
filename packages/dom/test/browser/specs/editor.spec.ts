import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

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
  await expect(content).toHaveAttribute("contenteditable", "plaintext-only");
  await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await content.pressSequentially("Updated HTML node");
  await content.press("Enter");
  await expect(content).toHaveText("Updated HTML node");
  await expect(content).not.toHaveAttribute("contenteditable", /.*/);
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

import { expect, test } from "@playwright/test";

test("keeps the selection overlay aligned when an iframe parent scrolls", async ({ page }) => {
  await page.goto("/");
  const frame = page.frameLocator("iframe");
  const target = frame.getByText("Scrollable target");
  await target.click();
  const overlay = page.locator("[data-overlay]");
  await frame.locator("#scroller").evaluate((element) => { element.scrollTop = 0; });
  await expect.poll(async () => await frame.locator("#scroller").evaluate((element) => element.scrollTop)).toBe(0);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const before = await overlay.boundingBox();
  if (!before) throw new Error("Selection overlay is not visible");

  await frame.locator("#scroller").evaluate((element) => { element.scrollTop = 120; });
  await expect.poll(async () => (await overlay.boundingBox())?.y).toBeCloseTo(before.y - 120, 0);
});

test("moves an iframe element and its selection overlay during drag", async ({ page }) => {
  await page.goto("/");
  const target = page.frameLocator("iframe").getByText("Scrollable target");
  await target.click();
  await expect(target).toHaveCSS("cursor", "move");
  const before = await target.boundingBox();
  if (!before) throw new Error("Target is not visible");

  await page.mouse.move(before.x + 10, before.y + 10);
  await page.mouse.down();
  await page.mouse.move(before.x + 70, before.y + 50);

  const preview = await target.boundingBox();
  const overlay = await page.locator("[data-overlay]").boundingBox();
  expect(preview?.x).toBeCloseTo(before.x + 60, 0);
  expect(preview?.y).toBeCloseTo(before.y + 40, 0);
  expect(overlay?.x).toBeCloseTo(preview?.x ?? 0, 0);
  expect(overlay?.y).toBeCloseTo(preview?.y ?? 0, 0);
  await page.mouse.up();
});

import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("exports the current document from the action bar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add element" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export HTML" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("muscat-export.html");
  const path = await download.path();
  if (!path) throw new Error("Exported HTML download is unavailable");
  const html = await readFile(path, "utf8");
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toContain("<title>Muscat export</title>");
  expect(html).toContain("Element 1");
  expect(html).not.toContain("data-muscat-node-id");
});

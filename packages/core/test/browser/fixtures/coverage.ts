import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test as base } from "@playwright/test";

declare global {
  interface Window {
    __coverage__?: Record<string, unknown>;
  }
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);
    const coverage = await page.evaluate(() => window.__coverage__);
    if (!coverage) return;
    const directory = path.resolve(import.meta.dirname, "../../../coverage/raw");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `browser-${testInfo.testId}.json`), JSON.stringify(coverage));
  },
});

export { expect } from "@playwright/test";

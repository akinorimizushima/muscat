import { expect, test } from "@playwright/test";

const primaryModifier = process.platform === "darwin" ? "Meta" : "Control";

test("undoes and redoes editor changes with keyboard shortcuts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add element" }).click();
  await expect(page.locator("[data-status]")).toHaveText("1 element");

  await page.keyboard.press(`${primaryModifier}+z`);
  await expect(page.locator("[data-status]")).toHaveText("0 elements");

  await page.keyboard.press(`${primaryModifier}+Shift+z`);
  await expect(page.locator("[data-status]")).toHaveText("1 element");

  await page.keyboard.press(`${primaryModifier}+z`);
  await expect(page.locator("[data-status]")).toHaveText("0 elements");

  await page.keyboard.press("Control+y");
  await expect(page.locator("[data-status]")).toHaveText("1 element");
});

test("leaves undo shortcuts to focused form controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import HTML" }).click();
  const source = page.getByLabel("HTML");
  await source.fill("<span>Revenue</span>");

  await page.keyboard.press(`${primaryModifier}+z`);

  await expect(source).toHaveValue("");
  await expect(page.locator("[data-status]")).toHaveText("0 elements");
});

import { expect, test } from "@playwright/test";

const demoUrl = "http://127.0.0.1:4174/";
const primaryModifier = process.platform === "darwin" ? "Meta" : "Control";

test("undoes and redoes editor changes with keyboard shortcuts", async ({ page }) => {
  await page.goto(demoUrl);
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
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Import HTML" }).click();
  const source = page.getByLabel("HTML");
  await source.fill("<span>Revenue</span>");

  await page.keyboard.press(`${primaryModifier}+z`);

  await expect(source).toHaveValue("");
  await expect(page.locator("[data-status]")).toHaveText("0 elements");
});

for (const key of ["Backspace", "Delete"] as const) {
  test(`${key} removes the selected canvas element`, async ({ page }) => {
    await page.goto(demoUrl);
    await page.getByRole("button", { name: "Add element" }).click();
    await page.getByLabel("Node element-1").click();
    await expect(page.locator("[data-selection-overlay]")).toBeVisible();

    await page.keyboard.press(key);

    await expect(page.locator("[data-status]")).toHaveText("0 elements");
    await expect(page.locator("[data-selection-overlay]")).toHaveCount(0);

    if (key === "Backspace") {
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(page.locator("[data-status]")).toHaveText("1 element");
      await expect(page.locator("[data-selection-overlay]")).toHaveCount(0);
    }
  });
}

test("leaves deletion keys to focused form controls", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  await page.getByLabel("Node element-1").click();
  await page.getByRole("button", { name: "Import HTML" }).click();
  const source = page.getByLabel("HTML");
  await source.fill("abc");

  await source.press("Backspace");

  await expect(source).toHaveValue("ab");
  await expect(page.locator("[data-status]")).toHaveText("1 element");
});

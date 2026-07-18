import { expect, test } from "../fixtures/coverage.js";

test("adds a node through the public editor API and undoes it", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Add node" }).click();
  await expect(page.getByLabel("Node node-0")).toHaveText("New node");
  await expect(page.getByRole("status")).toHaveText("1 nodes");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Node node-0")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("0 nodes");
});

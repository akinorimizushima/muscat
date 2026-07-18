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

test("drags a free-layout node and commits one undoable move", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add node" }).click();
  const node = page.getByLabel("Node node-0");
  await expect(node).toHaveCSS("left", "20px");
  await expect(node).toHaveCSS("top", "20px");

  const box = await node.boundingBox();
  if (!box) throw new Error("Node is not visible");
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 65, { steps: 5 });
  await page.mouse.up();

  await expect(node).toHaveCSS("left", "90px");
  await expect(node).toHaveCSS("top", "65px");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(node).toHaveCSS("left", "20px");
  await expect(node).toHaveCSS("top", "20px");
});

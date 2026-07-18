import { expect, test } from "@playwright/test";

const sampleHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Muscat import sample</title>
  </head>
  <body>
    <section style="background:#173f35;color:#f7f4eb;padding:24px;font-family:Arial,sans-serif">
      <p style="font-size:12px;text-transform:uppercase">Quarterly report</p>
      <h1 style="font-size:32px;margin:8px 0">A clearer view of growth</h1>
      <p style="line-height:1.5;margin:0">Revenue increased across every active region this quarter.</p>
    </section>
    <article style="background:#ffffff;border:1px solid #c9c4b8;padding:20px;font-family:Arial,sans-serif">
      <h2 style="font-size:18px;margin:0 0 16px">Key metrics</h2>
      <div style="display:flex;gap:24px">
        <div>
          <strong style="display:block;font-size:26px">+18%</strong>
          <span>Revenue</span>
        </div>
        <div>
          <strong style="display:block;font-size:26px">1,284</strong>
          <span>New accounts</span>
        </div>
      </div>
    </article>
    <form style="background:#f3ddd0;padding:20px;font-family:Arial,sans-serif">
      <label for="sample-email" style="display:block;margin-bottom:8px">Email report</label>
      <input id="sample-email" type="email" placeholder="name@example.com" style="padding:10px;width:220px">
      <button type="button" onclick="alert('This handler must be removed')" style="padding:10px 16px">Send</button>
    </form>
    <script>window.unsafeImportExecuted = true;</script>
  </body>
</html>`;

test("keeps the imported Revenue span at its dropped position", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import HTML" }).click();
  await page.getByLabel("HTML").fill(sampleHtml);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  const frame = page.frameLocator('iframe[title="Imported HTML document"]');
  const revenue = frame.getByText("Revenue", { exact: true });
  const before = await revenue.boundingBox();
  if (!before) throw new Error("Revenue span is not visible");

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 40);
  await page.mouse.up();
  await frame.getByText("New accounts", { exact: true }).click();

  await expect.poll(async () => (await revenue.boundingBox())?.x).toBeCloseTo(before.x + 60, 0);
  await expect.poll(async () => (await revenue.boundingBox())?.y).toBeCloseTo(before.y + 40, 0);
});

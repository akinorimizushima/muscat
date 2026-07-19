import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "specs",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  use: { ...devices["Desktop Chrome"], trace: "on-first-retry" },
  webServer: [
    {
      command: "vite --host 127.0.0.1 --port 4273 --strictPort",
      cwd: import.meta.dirname + "/harness",
      port: 4273,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @muscat/demo dev --port 4174 --strictPort",
      cwd: new URL("../../../..", import.meta.url).pathname,
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  use: {
    baseURL: "http://127.0.0.1:4174",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm dev --port 4174",
    cwd: new URL("../..", import.meta.url).pathname,
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
  },
});

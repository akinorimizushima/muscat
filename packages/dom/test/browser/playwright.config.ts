import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "specs",
  use: { baseURL: "http://127.0.0.1:4273" },
  webServer: {
    command: "vite --host 127.0.0.1 --port 4273 --strictPort",
    cwd: import.meta.dirname + "/harness",
    port: 4273,
    reuseExistingServer: false,
  },
});

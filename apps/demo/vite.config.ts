import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@muscat/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@muscat/dom": fileURLToPath(new URL("../../packages/dom/src/index.ts", import.meta.url)),
    },
  },
});

import { defineConfig } from "vite";
import istanbul from "vite-plugin-istanbul";

export default defineConfig({
  root: "test/browser/harness",
  plugins: [
    istanbul({
      cwd: import.meta.dirname,
      include: ["src/**/*.ts"],
      exclude: ["test/**"],
      requireEnv: true,
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    fs: { allow: [import.meta.dirname] },
  },
  build: { sourcemap: true },
});

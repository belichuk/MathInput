import { defineConfig } from "vite";

/** The demo site. The package itself is built by `vite.lib.config.ts`, which owns `dist/`. */
export default defineConfig({
  build: { outDir: "dist-demo" },
});

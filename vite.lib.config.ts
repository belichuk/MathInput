import { defineConfig } from "vite";

/**
 * The published package: the component and its stylesheet, with React left to the host.
 *
 * `vite.config.ts` builds the demo site instead — same source, different product, which
 * is why the two have separate configs and separate output directories.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: "src/index.ts",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "math-input.js" : "math-input.cjs"),
      // Lib mode extracts the CSS rather than injecting it, so the file is named for
      // the package and imported by the host: `@belichuk/math-input/styles.css`.
      cssFileName: "math-input",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});

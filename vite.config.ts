import { defineConfig } from "vitest/config";

/**
 * The package: what `npm run build` and `npm test` act on. Building the component is
 * the default here, and the demo keeps its own config in `demo/`.
 *
 * Vitest's `defineConfig` is Vite's with a `test` key, so the component is built and
 * tested from one description of itself rather than two that can drift apart.
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
    // React belongs to the application, not to a copy inside this bundle.
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
  test: {
    // Node by default; files needing a DOM opt in with a `@vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

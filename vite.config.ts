import type { UserConfig } from "vite";
import { type ViteUserConfig, defineConfig } from "vitest/config";

/**
 * The package: what `npm run build` and `npm test` act on. Building the component is
 * the default here, and the demo keeps its own config in `demo/`.
 *
 * Vitest's `defineConfig` is Vite's with a `test` key, so the component is built and
 * tested from one description of itself rather than two that can drift apart.
 *
 * The build half is annotated with the type from `vite` directly, and there is a real
 * reason for the extra line. There are two Vite copies in this tree: version 8 at the top,
 * which is what `npm run build` runs, and an older one under `vitest`, which is where
 * `vitest/config` takes its idea of a build config from. They are not the same type, and
 * the older one has never heard of the Rolldown output options version 8 accepts. Writing
 * `build` against Vite 8's own type means the option below is checked by the Vite that
 * actually reads it; the assertion where it is handed over is the seam between the two
 * copies and nothing more.
 */
const build: UserConfig["build"] = {
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
    // React belongs to the application, not to a copy inside this bundle.
    external: ["react", "react-dom", "react/jsx-runtime"],
    output: {
      /**
       * Minified per output, which is not the same thing as `build.minify`.
       *
       * Rolldown minifies an output at `dce-only` unless told otherwise: dead code goes,
       * whitespace stays. `build.minify` is a separate pass that mangles both builds, and
       * the CommonJS one happens to come out properly minified — but the ES one was emitted
       * mangled and *pretty-printed*, 1,500 lines of it, and that formatting was a fifth of
       * the published bundle. Raising the output's own setting is what reaches the
       * whitespace: 12,951 bytes gzipped became 11,429, in four lines instead of 1,508.
       *
       * The routes that do not work are worth recording, because two of them look right.
       * `build.minify: true` and `build.minify: "oxc"` change nothing at all, and
       * `build.minify: "esbuild"` makes the file 3% *larger* — which is exactly what the
       * 0.3.3 notes reported, so that observation was sound and only the conclusion drawn
       * from it was wrong. If a future version stops honouring this, the bundle quietly
       * gains 1.5 KB, which is what `npm run size` is in CI to catch.
       */
      minify: true,
    },
  },
};

export default defineConfig({
  build: build as ViteUserConfig["build"],
  test: {
    // Node by default; files needing a DOM opt in with a `@vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Timings, run on their own with `npm run bench`. What a keystroke costs in *layout* is
    // asserted in an ordinary test instead, because it is exact and belongs in CI.
    benchmark: { include: ["src/**/*.bench.ts"] },
  },
});

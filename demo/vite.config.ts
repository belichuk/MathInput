import { defineConfig } from "vite";

/**
 * The demo site — a style laboratory for developing the component against, and the
 * first look at it. It is not shipped, so it keeps its own root, entry and output,
 * and the package's config at the repository root stays about the package.
 */
export default defineConfig({
  // This file's own directory: a relative root would resolve against the working
  // directory instead, which is not where the demo lives.
  root: import.meta.dirname,
  build: {
    outDir: "../dist-demo",
    emptyOutDir: true,
    // Two pages: the demo, and the typography reference that sets the editor beside KaTeX.
    // Naming them both is what keeps the second one built — and therefore type-checked and
    // known to be working — rather than only ever opened by hand in `npm run dev`.
    rollupOptions: {
      input: {
        index: `${import.meta.dirname}/index.html`,
        "katex-reference": `${import.meta.dirname}/katex-reference.html`,
      },
    },
  },
});

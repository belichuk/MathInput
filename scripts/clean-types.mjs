import { readdir, readFile, writeFile } from "node:fs/promises";

/**
 * `tsc` copies the component's `import "./MathInput.css"` into its declaration file,
 * where it means nothing and resolves to nothing: the stylesheet ships as
 * `dist/math-input.css`, not next to the types. A consumer without `skipLibCheck`
 * would be handed an unresolvable import, so the line comes back out here.
 */
const types = new URL("../dist/types/", import.meta.url);

for (const name of await readdir(types)) {
  if (!name.endsWith(".d.ts")) continue;
  const file = new URL(name, types);
  const source = await readFile(file, "utf8");
  const cleaned = source.replace(/^import ["'][^"']+\.css["'];?\r?\n/gm, "");
  if (cleaned !== source) await writeFile(file, cleaned);
}

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

/**
 * What the package weighs, measured rather than claimed, and failed rather than noted.
 *
 * Two budgets rather than one: the whole component, and — once it exists — the
 * toolbar-free entry a field filled in from a keyboard alone can import. A single number
 * over everything would either be loose enough to let the toolbar hide inside it or tight
 * enough to decide behaviour, and behaviour is not settled by a byte count.
 *
 * Gzip comes from `node:zlib` at level 9, not the `gzip` command: the same Node gives the
 * same number on every machine, which is the only property a CI gate needs. It is worth
 * knowing that the two disagree — macOS `gzip -9` compresses this bundle about 105 bytes
 * smaller than zlib does, so the figures recorded during planning (12,846 for the ESM
 * build) read ~0.1 KB under the ones printed here for the very same file. The budgets
 * below carry enough headroom that the difference never decides a pass.
 *
 * A kilobyte is 1000 bytes here, which is how every size in the plan and the README was
 * written.
 */

const KB = 1000;

/**
 * `baseline` is the measurement taken at commit a425251, package version 0.3.7, before
 * any of the 0.5.0 work: not a limit, but the number every later one is read against, so
 * a regression shows up as movement rather than as merely "under budget".
 */
/**
 * The ceiling moved from 13.5 KB to 20 during the release, and it is worth writing down why
 * rather than leaving a number that looks arbitrary.
 *
 * The plan set 13.5 by adding up estimated savings and additions. Two of them were wrong in
 * opposite directions — the minifier gave more than expected, the icons far less — and the
 * work that was *not* estimated at all turned out to cost the most: memoising the rows, and
 * the typography, which is a tokeniser, a script ladder, four delimiters and a continuous
 * radical rather than the single line item it was budgeted as. By the vertical arrows there
 * were 217 bytes left and six of M4's seven steps still to write.
 *
 * The documented cut order was exhausted by then: the `grid` stub was never built, the
 * tokeniser is the typography and cannot be given back, and making spoken math opt-in frees
 * nothing until spoken math exists. What was left to cut was product, and decision D-3 is
 * that behaviour wins over bytes and the number moves instead. So it moved. It is still a
 * hard gate and still fails the build — a ceiling that is never tested is not a ceiling — and
 * the `vs 0.3.7` column is what actually catches drift between one commit and the next.
 */
const TARGETS = [
  { file: "dist/math-input.js", label: "ESM bundle", budget: 20 * KB, baseline: 12_951 },
  // Reported, never gated: no browser loads the CommonJS build, and it exists for
  // bundlers that still ask for one. It is here because it is the more honest account of
  // how much code there really is — the ESM emit is the pretty-printed one.
  { file: "dist/math-input.cjs", label: "CommonJS build", budget: null, baseline: 11_486 },
  { file: "dist/math-input.css", label: "stylesheet", budget: 3 * KB, baseline: 2_121 },
  // The toolbar-free entry is a deliverable, not an aspiration, so its budget is written
  // down before the entry is: until the build emits one, this row reports itself missing
  // and gates nothing.
  { file: "dist/math-input.core.js", label: "core entry, toolbar-free", budget: 10.5 * KB, baseline: null, pending: true },
];

const kb = (bytes) => `${(bytes / KB).toFixed(2)} KB`;
const count = (bytes) => bytes.toLocaleString("en-US");

async function measure(target) {
  const source = await readFile(new URL(`../${target.file}`, import.meta.url)).catch(() => null);
  if (!source) return { ...target, missing: true };
  return { ...target, raw: source.length, gzip: gzipSync(source, { level: 9 }).length };
}

const built = await measure(TARGETS[0]);
if (built.missing) {
  console.log("dist/ is not built yet — building it first.\n");
  execFileSync("npm", ["run", "build"], { stdio: "inherit" });
}

const results = await Promise.all(TARGETS.map(measure));

const columns = [
  { head: "target", width: 26, of: (row) => row.label, pad: "end" },
  { head: "raw", width: 9, of: (row) => (row.missing ? "—" : count(row.raw)) },
  { head: "gzip", width: 9, of: (row) => (row.missing ? "—" : count(row.gzip)) },
  { head: "budget", width: 10, of: (row) => (row.budget === null ? "—" : kb(row.budget)) },
  { head: "headroom", width: 11, of: (row) => (row.missing || row.budget === null ? "—" : `${row.gzip > row.budget ? "" : "+"}${count(row.budget - row.gzip)} B`) },
  {
    head: "vs 0.3.7",
    width: 11,
    of: (row) => {
      if (row.missing || row.baseline === null) return "—";
      const delta = row.gzip - row.baseline;
      return delta === 0 ? "unchanged" : `${delta > 0 ? "+" : "−"}${count(Math.abs(delta))} B`;
    },
  },
];

const line = (cells) => cells.map((cell, at) => (columns[at].pad === "end" ? cell.padEnd(columns[at].width) : cell.padStart(columns[at].width))).join("  ");

console.log("Bundle size — gzip level 9, node:zlib, React external\n");
console.log(line(columns.map((column) => column.head)));
console.log(line(columns.map((column) => "─".repeat(Math.min(column.width, column.head.length + 2)))));
for (const row of results) console.log(line(columns.map((column) => column.of(row))));
console.log();

/**
 * The constraint a size number cannot express: nothing ships but the component.
 *
 * A dependency is not caught by a byte count, because it is not in the bundle — it is
 * fetched alongside it, and it costs the host far more than anything measured above. The
 * demo now devDepends on KaTeX to compare typography against, which is exactly the kind of
 * thing that becomes a real dependency by way of one convenient import from `src/`, so the
 * ban is checked rather than remembered.
 */
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const runtime = Object.keys(manifest.dependencies ?? {});
const problems = [];
if (runtime.length > 0) problems.push(`package.json declares runtime dependencies: ${runtime.join(", ")}. The component has none.`);

const bundle = results.find((row) => row.file === "dist/math-input.js");
if (!bundle.missing) {
  const source = await readFile(new URL("../dist/math-input.js", import.meta.url), "utf8");
  for (const banned of ["katex"]) {
    if (source.includes(banned)) problems.push(`dist/math-input.js mentions "${banned}", which belongs to the demo alone.`);
  }
}

for (const problem of problems) console.error(`error: ${problem}`);

const pending = results.filter((row) => row.missing && row.pending);
for (const row of pending) console.log(`note: ${row.file} is not built yet, so its ${kb(row.budget)} budget gates nothing.`);

const absent = results.filter((row) => row.missing && !row.pending);
for (const row of absent) console.error(`error: ${row.file} is missing from a completed build.`);

const over = results.filter((row) => !row.missing && row.budget !== null && row.gzip > row.budget);
for (const row of over) console.error(`error: ${row.label} is ${count(row.gzip - row.budget)} B over its ${kb(row.budget)} budget.`);

if (pending.length > 0) console.log();
if (over.length > 0 || absent.length > 0 || problems.length > 0) process.exit(1);
console.log("Every budget met, and the package still depends on nothing.");

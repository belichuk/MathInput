// @vitest-environment jsdom
import { afterAll, beforeAll, bench, describe } from "vitest";
import { type Fixture, type MountedEditor, FIXTURES, measureKeystroke, mountEditor } from "./harness";

/**
 * What a keystroke costs, in time and in layout.
 *
 * `npm run bench` reports both, and they answer different questions. The layout table is
 * the one with a target: it is exact, it is the same on every machine, and
 * `layout-reads.test.ts` holds CI to it. The timings underneath are the opposite — jsdom is
 * not a browser and the absolute numbers mean nothing outside this harness — but the
 * *ratios* between the three fixtures are real, and they are what says whether the shell
 * does work per row that it should be doing per edited row.
 *
 * A keystroke is benchmarked as a pair, one character typed and then deleted. Timing a bare
 * insertion means benchmarking a row that grows by one character every iteration, so by the
 * end the two-character answer is a two-thousand-character one and the number describes a
 * field nobody has: the pair leaves the row exactly as it was found, and every iteration
 * measures the same edit.
 */

beforeAll(() => {
  const rows = FIXTURES.map((fixture) => {
    const measured = measureKeystroke(fixture);
    return {
      fixture: fixture.name,
      rows: measured.rows,
      dividers: measured.dividers,
      reads: measured.reads,
      writes: measured.writes,
      forced: measured.forcedLayouts,
    };
  });

  const columns = ["fixture", "rows", "dividers", "reads", "writes", "forced"] as const;
  const width = (column: (typeof columns)[number]) => Math.max(column.length, ...rows.map((row) => String(row[column]).length));
  const line = (cells: readonly string[]) => cells.map((cell, at) => (at === 0 ? cell.padEnd(width(columns[at])) : cell.padStart(width(columns[at]) + 2))).join("");

  console.log("\nLayout per keystroke — reads asked for, style writes made, layouts forced\n");
  console.log(line(columns));
  for (const row of rows) console.log(line(columns.map((column) => String(row[column]))));
  console.log("\n`forced` is the one that matters: reads a browser could not have answered from");
  console.log("the layout it already had. Today's shell reads, writes, and reads again.\n");
});

/**
 * Mounted on first use rather than in a hook: a `beforeAll` inside a `describe` does not
 * run before the benchmarks that suite holds — the tasks are collected and handed to the
 * runner, and every iteration would find an empty map. Warm-up iterations mean the one
 * mount this puts inside the first sample is not in the reported numbers.
 */
const editors = new Map<string, MountedEditor>();
const editorFor = (fixture: Fixture): MountedEditor => {
  const editor = editors.get(fixture.name) ?? mountEditor(fixture);
  editors.set(fixture.name, editor);
  return editor;
};
afterAll(() => { for (const editor of editors.values()) editor.unmount(); editors.clear(); });

describe("a keystroke", () => {
  for (const fixture of FIXTURES) {
    bench(`${fixture.name} — typed and deleted (${fixture.description})`, () => {
      const editor = editorFor(fixture);
      // Several editors are mounted at once, so each says it is the focused one before typing.
      editor.focus();
      editor.type("7");
      editor.remove();
    });
  }
});

describe("a first render", () => {
  for (const fixture of FIXTURES) {
    bench(`${fixture.name} — mounted and unmounted (${fixture.description})`, () => {
      mountEditor(fixture).unmount();
    });
  }
});

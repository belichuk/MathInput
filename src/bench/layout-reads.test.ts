// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { FIXTURES, measureKeystroke } from "./harness";

/**
 * The hot path, held to a number.
 *
 * **One forced layout per keystroke, whatever is on the page.** That is the whole
 * specification, and the rest of this file is the arithmetic that proves the shell is
 * really structured the way that number implies rather than happening to hit it.
 *
 * A forced layout is a read the browser could not answer from the layout it already had:
 * the first one after a render, and every one that follows a write. The shell reads
 * everything it needs in one phase and writes everything in the next, so there is exactly
 * one — and adding a read to the read phase, which is cheap, cannot turn into a second
 * layout, which is not.
 *
 * Reads: `5 + 3D`, for D toolbar dividers. **No term in R.**
 *   2   the caret pass — the caret's own rectangle, then the field's (`selection.ts`)
 *   3   the edited row's scroll indicator: `scrollWidth`, `clientWidth`, `scrollLeft`
 *   3D  each toolbar divider, asking its own top and height and its group's top
 *
 * What this replaced, for the record, because both terms of it mattered:
 *
 *   before   2 + 7R + 3D reads, 1 + (R − 1) + D forced layouts
 *   after    5 + 3D reads, 1 forced layout
 *
 * Three things were wrong and each shows up in one of those terms. The `7R` was two
 * mistakes at once: each of `scrollWidth`, `clientWidth` and `scrollLeft` was asked for
 * three times over in one function, and it was asked of *every* row on a keystroke that
 * could only have changed one — so a fifty-row worksheet paid 350 reads for an edit in a
 * single row. The `1 + (R − 1) + D` was the ornament passes writing in the middle of
 * reading. On a one-row field that was 15 reads in 3 layouts; on a fifty-row one, 358 in 52.
 */
const SPECIFICATION = {
  reads: (dividers: number) => 5 + 3 * dividers,
  forcedLayouts: 1,
};

describe("what a keystroke costs in layout", () => {
  it.each(FIXTURES)("$name — $description", (fixture) => {
    const measured = measureKeystroke(fixture);
    expect(measured.forcedLayouts).toBe(SPECIFICATION.forcedLayouts);
    expect(measured.reads).toBe(SPECIFICATION.reads(measured.dividers));
  });

  /**
   * The claim that costs the most to get wrong, so it is asserted as a difference rather
   * than as two numbers that happen to agree: fifty rows cost exactly what one row costs.
   */
  it("costs the same on fifty rows as on one", () => {
    const one = measureKeystroke(FIXTURES[0]);
    const fifty = measureKeystroke(FIXTURES[1]);
    expect(one.rows).toBe(1);
    expect(fifty.rows).toBe(50);
    expect(fifty.reads).toBe(one.reads);
    expect(fifty.writes).toBe(one.writes);
    expect(fifty.forcedLayouts).toBe(one.forcedLayouts);
  });

  /**
   * The structure behind the number. Counting forced layouts would still read 1 if the pass
   * wrote first and read afterwards, so this asserts the shape directly: every read comes
   * before every write, with no interleaving anywhere.
   */
  it("reads the page, then writes it, and never the other way about", () => {
    for (const fixture of FIXTURES) {
      const { ops } = measureKeystroke(fixture);
      const firstWrite = ops.findIndex((op) => op.kind === "write");
      expect(firstWrite).toBeGreaterThan(0);
      expect(ops.slice(firstWrite).every((op) => op.kind === "write")).toBe(true);
    }
  });

  /** A read counts once wherever it is asked from, so the breakdown has to add up to the total. */
  it("accounts for every read it counts", () => {
    const measured = measureKeystroke(FIXTURES[0]);
    expect(measured.byProperty).toEqual({
      // The caret: its own rectangle, then the field it has to be brought into view within.
      "Range.getBoundingClientRect": 1,
      getBoundingClientRect: 1,
      // The edited row's scroll indicator: once each, not three times each.
      scrollWidth: 1,
      clientWidth: 1,
      scrollLeft: 1,
      // Two dividers: each asks its own top and height, and the top of the group after it.
      offsetTop: 4,
      offsetHeight: 2,
      // The writes, all of them after all of the reads.
      "style.width": 1,
      "style.left": 1,
      "style.visibility": 2,
    });
    expect(measured.writes).toBe(4);
  });
});

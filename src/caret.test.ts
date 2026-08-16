import { describe, expect, it } from "vitest";
import { type CaretPosition, type FormulaNode, collapsedAt } from "./model";
import { clampPosition, endOfArray, enterNode, nextPosition, previousPosition, rowEnd, rowStart, skipForward } from "./caret";
import { parseLatex } from "./parse";
import { at, inside, rowOf, sketch, top } from "./testing";

/** The positions a movement visits from `start`, each drawn as LaTeX with the caret marked. */
function trail(content: FormulaNode[], start: CaretPosition, step: (position: CaretPosition) => CaretPosition | null): string[] {
  let position = start;
  const seen = [sketch({ content, selection: collapsedAt(position) })];
  for (let guard = 0; guard < 200; guard += 1) {
    const next = step(position);
    if (!next) return seen;
    position = next;
    seen.push(sketch({ content, selection: collapsedAt(position) }));
  }
  throw new Error("caret walk did not terminate");
}

/** Every caret position in the row, in order, drawn as LaTeX with the caret marked. */
function walk(latex: string, direction: "forward" | "backward" = "forward"): string[] {
  const content = parseLatex(latex);
  const move = direction === "forward" ? nextPosition : previousPosition;
  return trail(content, direction === "forward" ? rowStart() : rowEnd(content), (position) => move(content, position));
}

/** The same row read a press of the space bar at a time. */
function skips(latex: string, from: CaretPosition = rowStart()): string[] {
  const content = parseLatex(latex);
  return trail(content, from, (position) => skipForward(content, position));
}

describe("caret walk", () => {
  it("enters a root, then leaves it", () => {
    expect(walk("\\sqrt{9}+1")).toEqual([
      "|\\sqrt{9}+1",
      "\\sqrt{|9}+1",
      "\\sqrt{9|}+1",
      "\\sqrt{9}|+1",
      "\\sqrt{9}+|1",
      "\\sqrt{9}+1|",
    ]);
  });

  it("walks a fraction numerator, then denominator, then out", () => {
    expect(walk("\\frac{1}{2}")).toEqual([
      "|\\frac{1}{2}",
      "\\frac{|1}{2}",
      "\\frac{1|}{2}",
      "\\frac{1}{|2}",
      "\\frac{1}{2|}",
      "\\frac{1}{2}|",
    ]);
  });

  it("walks a power's base before its exponent", () => {
    expect(walk("10^{2}")).toEqual([
      "|10^{2}",
      "|10^{2}", // the run before the power and the start of its base are the same spot on screen
      "1|0^{2}",
      "10|^{2}",
      "10^{|2}",
      "10^{2|}",
      "10^{2}|",
    ]);
  });

  it("visits a root index before the radicand", () => {
    expect(walk("\\sqrt[3]{8}")).toEqual([
      "|\\sqrt[3]{8}",
      "\\sqrt[|3]{8}",
      "\\sqrt[3|]{8}",
      "\\sqrt[3]{|8}",
      "\\sqrt[3]{8|}",
      "\\sqrt[3]{8}|",
    ]);
  });

  it("descends into nesting and comes back out", () => {
    expect(walk("\\frac{\\sqrt{2}}{3}")).toEqual([
      "|\\frac{\\sqrt{2}}{3}",
      "\\frac{|\\sqrt{2}}{3}",
      "\\frac{\\sqrt{|2}}{3}",
      "\\frac{\\sqrt{2|}}{3}",
      "\\frac{\\sqrt{2}|}{3}",
      "\\frac{\\sqrt{2}}{|3}",
      "\\frac{\\sqrt{2}}{3|}",
      "\\frac{\\sqrt{2}}{3}|",
    ]);
  });

  it("retraces exactly the same positions backwards", () => {
    for (const latex of ["\\sqrt{9}+1", "\\frac{1}{2}", "10^{2}", "\\sqrt[3]{8}", "\\frac{\\sqrt{2}}{3}", "x_{i}^{2}", "\\left(9+16\\right)", "1+2", ""]) {
      expect(walk(latex, "backward"), latex).toEqual([...walk(latex)].reverse());
    }
  });

  it("stops at both ends of the row", () => {
    const content = parseLatex("1+2");
    expect(previousPosition(content, rowStart())).toBeNull();
    expect(nextPosition(content, rowEnd(content))).toBeNull();
  });

  it("steps over a surrogate pair as one character", () => {
    const state = rowOf("a🙂b");
    expect(nextPosition(state.content, top(0, 1))).toEqual(top(0, 3));
    expect(previousPosition(state.content, top(0, 3))).toEqual(top(0, 1));
  });
});

describe("skipping forward", () => {
  it("finishes the run the caret is writing in", () => {
    expect(skips("1+2")).toEqual(["|1+2", "1+2|"]);
  });

  it("leaves a root, and a power, once what they hold is written", () => {
    expect(skips("\\sqrt{1}", inside(1, "content", 0, 1))).toEqual(["\\sqrt{1|}", "\\sqrt{1}|"]);
    expect(skips("x^{2}", inside(1, "exponent", 0, 1))).toEqual(["x^{2|}", "x^{2}|"]);
  });

  it("moves down to the end of a denominator, then out of the fraction", () => {
    expect(skips("\\frac{1}{2}", inside(1, "numerator", 0, 1))).toEqual([
      "\\frac{1|}{2}",
      "\\frac{1}{2|}",
      "\\frac{1}{2}|",
    ]);
  });

  it("crosses a root's index into its radicand", () => {
    expect(skips("\\sqrt[3]{8}", inside(1, "index", 0, 1))).toEqual([
      "\\sqrt[3|]{8}",
      "\\sqrt[3]{8|}",
      "\\sqrt[3]{8}|",
    ]);
  });

  it("steps over a formula standing in front of the caret rather than into it", () => {
    expect(skips("1+\\sqrt{2}+3")).toEqual([
      "|1+\\sqrt{2}+3",
      "1+|\\sqrt{2}+3",
      "1+\\sqrt{2}|+3",
      "1+\\sqrt{2}+3|",
    ]);
  });

  it("climbs out of nesting one formula per press", () => {
    expect(skips("\\frac{\\sqrt{2}}{3}", at([{ index: 1, branch: "numerator" }, { index: 1, branch: "content" }, { index: 0 }]))).toEqual([
      "\\frac{\\sqrt{|2}}{3}",
      "\\frac{\\sqrt{2|}}{3}",
      "\\frac{\\sqrt{2}|}{3}",
      "\\frac{\\sqrt{2}}{3|}",
      "\\frac{\\sqrt{2}}{3}|",
    ]);
  });

  it("stops at the end of the row", () => {
    const content = parseLatex("1+2");
    expect(skipForward(content, rowEnd(content))).toBeNull();
  });
});

describe("entering and leaving nodes", () => {
  it("enters a node's first or last slot", () => {
    const state = rowOf("\\frac{1}{2}");
    expect(enterNode(state.content, [{ index: 1 }], "first")).toEqual(inside(1, "numerator", 0, 0));
    expect(enterNode(state.content, [{ index: 1 }], "last")).toEqual(inside(1, "denominator", 0, 1));
  });

  it("refuses to enter a text run", () => {
    expect(enterNode(rowOf("1").content, [{ index: 0 }], "first")).toBeNull();
  });

  it("finds the end of an array", () => {
    const state = rowOf("1+\\sqrt{2}");
    expect(endOfArray(state.content, [])).toEqual(top(2, 0));
    expect(endOfArray(state.content, [{ index: 1, branch: "content" }])).toEqual(inside(1, "content", 0, 1));
  });
});

describe("clampPosition", () => {
  it("pulls an out-of-range offset back onto the run", () => {
    const state = rowOf("12");
    expect(clampPosition(state.content, top(0, 99))).toEqual(top(0, 2));
  });

  it("falls back to the row start when the path is nonsense", () => {
    expect(clampPosition(rowOf("12").content, top(7, 0))).toEqual(rowStart());
  });

  it("refuses to sit on a formula rather than in it", () => {
    expect(clampPosition(rowOf("\\sqrt{2}").content, top(1, 0))).toEqual(rowStart());
  });
});

import { describe, expect, it } from "vitest";
import { type ConstructKind, CONSTRUCTS } from "./registry";
import { buildConstruct } from "./model";
import { parseLatex } from "./parse";
import { slotAt, speakNodes, speakRow } from "./speech";

/** No DOM anywhere in this file: the reading comes from the tree and from nothing else. */
const say = (latex: string) => speakNodes(parseLatex(latex));

describe("reading a formula aloud", () => {
  it("names the operations rather than leaving them as marks", () => {
    expect(say("1+2")).toBe("1 plus 2");
    expect(say("x-y")).toBe("x minus y");
    expect(say("2\\cdot 3")).toBe("2 times 3");
    expect(say("6:3")).toBe("6 divided by 3");
    expect(say("x=12")).toBe("x equals 12");
  });

  it("reads a sign as a sign and an operation as an operation, which is the same distinction the spacing draws", () => {
    // The `-` of `-b` is not subtracting anything: the tokeniser says so, the stylesheet gives
    // it no space, and here it is a different word.
    expect(say("-b")).toBe("negative b");
    expect(say("a-b")).toBe("a minus b");
  });

  it("says where a fraction and a root end, because the drawing that says so cannot be heard", () => {
    expect(say("\\frac{1}{2}")).toBe("the fraction 1 over 2, end fraction");
    expect(say("\\sqrt{9+16}")).toBe("the square root of 9 plus 16, end root");
    expect(say("\\sqrt[3]{8}")).toBe("the cube root of 8, end root");
    expect(say("\\sqrt[n]{8}")).toBe("the n root of 8, end root");
    expect(say("\\left(1+2\\right)")).toBe("open bracket 1 plus 2 close bracket");
  });

  it("says a square and a cube the way anyone says them, and brackets anything longer", () => {
    expect(say("x^{2}")).toBe("x squared");
    expect(say("x^{3}")).toBe("x cubed");
    // "x to the power of n plus 1" would not say where the exponent stopped.
    expect(say("x^{n+1}")).toBe("x to the power of n plus 1, end power");
    expect(say("x_{i}")).toBe("x sub i");
  });

  it("reads a formula built out of formulas from the inside out", () => {
    expect(say("\\frac{\\sqrt{2}}{3}")).toBe("the fraction the square root of 2, end root over 3, end fraction");
    expect(say("x=\\frac{\\left(1+\\sqrt{2}\\right)}{3}^{n}"))
      .toBe("x equals the fraction open bracket 1 plus the square root of 2, end root close bracket over 3, end fraction to the power of n, end power");
  });

  it("names what has not been written yet, which is most of what an editor holds", () => {
    expect(say("\\frac{1}{}")).toBe("the fraction 1 over blank, end fraction");
    expect(say("\\sqrt{}")).toBe("the square root of blank, end root");
    expect(speakRow(parseLatex(""))).toBe("empty");
  });

  /**
   * The guarantee the registry gives, kept for a table that is not in the registry: every
   * construct has a reading. `SPOKEN` is checked against `Record<ConstructKind, Reading>` at
   * compile time, and this is the runtime half — a reading that returns nothing, or that
   * silently drops the slot it was given, is a construct nobody can hear.
   */
  it("has a reading for every construct, and every reading uses what is in its slots", () => {
    for (const kind of Object.keys(CONSTRUCTS) as ConstructKind[]) {
      const marker = "zq";
      const node = buildConstruct(kind, Object.fromEntries(CONSTRUCTS[kind].slots.map((slot) => [slot.key, parseLatex(marker)])));
      const said = speakNodes([node]);
      expect(said, kind).not.toBe("");
      // Every slot the construct was given is audible in what comes out of it.
      const slots = CONSTRUCTS[kind].slots.length;
      expect(said.split(marker).length - 1, kind).toBe(slots);
    }
  });
});

describe("saying where the caret is", () => {
  // `[run, fraction, run, power, run]`: the alternation invariant puts a run at both ends and
  // between the two constructs, so the fraction is at index 1 and the power at index 3.
  const nodes = parseLatex("\\frac{1}{\\sqrt[3]{2}}+x^{4}");

  it("names the slot a path is in, from the path alone", () => {
    expect(slotAt(nodes, [{ index: 1, branch: "numerator" }, { index: 0 }])).toBe("in the numerator");
    expect(slotAt(nodes, [{ index: 1, branch: "denominator" }, { index: 0 }])).toBe("in the denominator");
    expect(slotAt(nodes, [{ index: 1, branch: "denominator" }, { index: 1, branch: "content" }, { index: 0 }])).toBe("in the root");
    expect(slotAt(nodes, [{ index: 1, branch: "denominator" }, { index: 1, branch: "index" }, { index: 0 }])).toBe("in the root index");
    expect(slotAt(nodes, [{ index: 3, branch: "exponent" }, { index: 0 }])).toBe("in the exponent");
    expect(slotAt(nodes, [{ index: 3, branch: "base" }, { index: 0 }])).toBe("at the base");
  });

  it("says nothing at the top level, where there is no slot to be in", () => {
    expect(slotAt(nodes, [{ index: 0 }])).toBeNull();
    expect(slotAt(nodes, [])).toBeNull();
  });

  it("names the innermost slot when a formula sits inside another", () => {
    // The path passes through a denominator on its way to a radicand; the radicand is where
    // the caret is, and the only one worth saying.
    expect(slotAt(nodes, [{ index: 1, branch: "denominator" }, { index: 1, branch: "content" }, { index: 0 }])).toBe("in the root");
  });
});

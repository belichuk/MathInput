import { describe, expect, it } from "vitest";
import { isNormalized, frac, group, power, sqrt, subscript, text } from "./model";
import { cleanFormulaText, parseLatex } from "./parse";

describe("cleanFormulaText", () => {
  it("drops whitespace and shows multiplication as a dot", () => {
    expect(cleanFormulaText(" 2 * 3 ")).toBe("2⋅3");
  });
});

describe("parseLatex", () => {
  it("splits a formula into the terms it is made of", () => {
    expect(parseLatex("\\sqrt{9+16}+10^{2}-\\frac{1}{2}")).toEqual([
      text(""),
      sqrt([text("9+16")]),
      text("+"),
      power([text("10")], [text("2")]),
      text("-"),
      frac([text("1")], [text("2")]),
      text(""),
    ]);
  });

  it("always returns an alternating array", () => {
    for (const line of ["", "1+2", "\\sqrt{2}\\sqrt{3}", "\\frac{\\sqrt{2}}{x^{2}}", "(((", "\\frac{1}"]) {
      expect(isNormalized(parseLatex(line)), line).toBe(true);
    }
  });

  it("reads plain text as a single run", () => {
    expect(parseLatex("1+2")).toEqual([text("1+2")]);
  });

  it("strips whitespace and rewrites *, × and \\times as the dot", () => {
    expect(parseLatex("2 * 3")).toEqual([text("2⋅3")]);
    expect(parseLatex("2 × 3")).toEqual([text("2⋅3")]);
    expect(parseLatex("2\\times3")).toEqual([text("2⋅3")]);
    expect(parseLatex("2\\cdot3")).toEqual([text("2⋅3")]);
  });

  it("reads roots, fractions and groups", () => {
    expect(parseLatex("\\sqrt{9}")).toEqual([text(""), sqrt([text("9")]), text("")]);
    expect(parseLatex("\\sqrt[3]{8}")).toEqual([text(""), sqrt([text("8")], [text("3")]), text("")]);
    expect(parseLatex("\\frac{1}{2}")).toEqual([text(""), frac([text("1")], [text("2")]), text("")]);
    expect(parseLatex("(9+16)")).toEqual([text(""), group([text("9+16")]), text("")]);
    expect(parseLatex("\\left(9+16\\right)")).toEqual([text(""), group([text("9+16")]), text("")]);
  });

  it("gives a power the term in front of it as its base", () => {
    expect(parseLatex("10^{2}")).toEqual([text(""), power([text("10")], [text("2")]), text("")]);
    expect(parseLatex("x+10^{2}")).toEqual([text("x+"), power([text("10")], [text("2")]), text("")]);
    expect(parseLatex("\\frac{1}{2}^{3}")).toEqual([text(""), power([text(""), frac([text("1")], [text("2")]), text("")], [text("3")]), text("")]);
  });

  it("accepts a single character as a script, like LaTeX does", () => {
    expect(parseLatex("x^2")).toEqual([text(""), power([text("x")], [text("2")]), text("")]);
    expect(parseLatex("x_i")).toEqual([text(""), subscript([text("x")], [text("i")]), text("")]);
  });

  it("nests a subscript inside a power for x_{i}^{2}", () => {
    expect(parseLatex("x_{i}^{2}")).toEqual([
      text(""),
      power([text(""), subscript([text("x")], [text("i")]), text("")], [text("2")]),
      text(""),
    ]);
  });

  it("leaves an empty base when nothing precedes the script", () => {
    expect(parseLatex("^{2}")).toEqual([text(""), power([text("")], [text("2")]), text("")]);
  });

  describe("malformed input", () => {
    it("falls back to literal text when a command has no group", () => {
      expect(parseLatex("\\sqrt")).toEqual([text("\\sqrt")]);
      expect(parseLatex("\\sqrt[3]")).toEqual([text("\\sqrt[3]")]);
      expect(parseLatex("\\frac")).toEqual([text("\\frac")]);
      expect(parseLatex("^")).toEqual([text("^")]);
      expect(parseLatex("x^")).toEqual([text("x^")]);
      expect(parseLatex("_")).toEqual([text("_")]);
    });

    it("tolerates a group left unclosed at the end of the line", () => {
      expect(parseLatex("\\sqrt{9")).toEqual([text(""), sqrt([text("9")]), text("")]);
      expect(parseLatex("\\frac{1}{2")).toEqual([text(""), frac([text("1")], [text("2")]), text("")]);
      expect(parseLatex("(9")).toEqual([text(""), group([text("9")]), text("")]);
    });

    it("keeps a half-written fraction's numerator as real nodes beside literal text", () => {
      expect(parseLatex("\\frac{1}")).toEqual([text("\\frac{1}")]);
      expect(parseLatex("\\frac{\\sqrt{2}}")).toEqual([text("\\frac{"), sqrt([text("2")]), text("}")]);
    });

    it("reads a stray closing delimiter as text", () => {
      expect(parseLatex(")")).toEqual([text(")")]);
      expect(parseLatex("}")).toEqual([text("}")]);
    });
  });
});

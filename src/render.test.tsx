// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type FormulaNode, decodePath, isText, resolve, resolveArray } from "./model";
import { parseLatex } from "./parse";
import { CARET_PLACEHOLDER, renderNodes } from "./render";

const draw = (nodes: FormulaNode[]) => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<>{renderNodes(nodes)}</>);
  return host;
};

const SAMPLES = [
  "1+2=3",
  "\\sqrt{9+16}+10^{2}-\\frac{1}{2}",
  "\\sqrt[3]{8}+x_{i}^{2}+\\left(9+16\\right)",
  "\\frac{\\sqrt{\\frac{1}{2}}}{}",
  "",
];

describe("renderNodes", () => {
  it("gives every element an address that resolves in the tree it came from", () => {
    for (const sample of SAMPLES) {
      const nodes = parseLatex(sample);
      for (const element of draw(nodes).querySelectorAll<HTMLElement>("[data-path]")) {
        const path = decodePath(element.dataset.path!);
        const target = element.classList.contains("math-input__slot") ? resolveArray(nodes, path) : resolve(nodes, path);
        expect(target, `${sample} → ${element.dataset.path}`).not.toBeNull();
      }
    }
  });

  it("addresses every node and slot of the tree exactly once", () => {
    const host = draw(parseLatex("\\frac{1}{2}"));
    expect([...host.querySelectorAll("[data-path]")].map((element) => (element as HTMLElement).dataset.path))
      .toEqual(["0", "1", "1.numerator", "1.numerator/0", "1.denominator", "1.denominator/0", "2"]);
  });

  it("renders a text run as its own element, and an empty one as a caret placeholder", () => {
    const host = draw(parseLatex("\\sqrt{9}"));
    const runs = [...host.querySelectorAll(".math-input__text")];
    expect(runs.map((run) => run.textContent)).toEqual([CARET_PLACEHOLDER, "9", CARET_PLACEHOLDER]);
    expect(runs.filter((run) => (run as HTMLElement).dataset.blank !== undefined)).toHaveLength(2);
  });

  it("keeps the class contract the stylesheet is written against", () => {
    const host = draw(parseLatex("\\sqrt[3]{8}\\frac{1}{2}x^{2}y_{i}\\left(9\\right)"));
    for (const selector of [
      ".math-input__root", ".math-input__root--s", ".math-input__root--indexed", ".math-input__root-body", ".math-input__root-symbol",
      ".math-input__fraction", ".math-input__power", ".math-input__subscript", ".math-input__group", ".math-input__paren",
      ".math-input__slot--radicand", ".math-input__slot--root-index", ".math-input__slot--numerator", ".math-input__slot--denominator",
      ".math-input__slot--base", ".math-input__slot--exponent", ".math-input__slot--subscript", ".math-input__slot--group",
    ]) expect(host.querySelector(selector), selector).not.toBeNull();
  });

  it("marks blank slots so the dotted placeholder can be styled", () => {
    const host = draw(parseLatex("\\frac{1}{}"));
    const blanks = [...host.querySelectorAll<HTMLElement>(".math-input__slot[data-blank]")];
    expect(blanks.map((slot) => slot.dataset.slot)).toEqual(["denominator"]);
  });

  it("draws the radical, stretched to its radicand but stroked at a fixed width", () => {
    const symbol = draw(parseLatex("\\sqrt{9}")).querySelector<SVGElement>("svg.math-input__root-symbol")!;
    expect(symbol.getAttribute("preserveAspectRatio")).toBe("none");
    expect(symbol.querySelector("path")?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    // Nothing of the radical is text: no font supplies it, so no font can move it.
    expect(symbol.textContent).toBe("");
  });

  it("draws a cube root as the same radical with an index beside it", () => {
    const root = draw(parseLatex("\\sqrt[3]{8}")).querySelector<HTMLElement>(".math-input__root")!;
    expect(root.className).toContain("math-input__root--indexed");
    // The index is the root's own child, outside the body the radical is drawn over.
    expect([...root.children].map((child) => child.getAttribute("data-slot") ?? child.className)).toEqual(["index", "math-input__root-body"]);
    expect(root.querySelectorAll("svg.math-input__root-symbol")).toHaveLength(1);
  });

  it("puts a slot's own address on it, so a click can be traced back to its array", () => {
    const nodes = parseLatex("\\frac{1}{2}");
    const host = draw(nodes);
    const numerator = host.querySelector<HTMLElement>('[data-slot="numerator"]')!;
    const array = resolveArray(nodes, decodePath(numerator.dataset.path!))!;
    expect(array).toHaveLength(1);
    expect(isText(array[0]) && array[0].value).toBe("1");
  });
});

describe("the size of a radical", () => {
  const sizesIn = (latex: string) => [...draw(parseLatex(latex)).querySelectorAll<HTMLElement>(".math-input__root")].map((root) => root.className.match(/root--([sml])/)![1]);
  const sizeOf = (latex: string) => sizesIn(latex)[0];

  it("keeps the small radical for a number, however long, and for a script", () => {
    expect(sizeOf("\\sqrt{9}")).toBe("s");
    expect(sizeOf("\\sqrt{9+16+25}")).toBe("s");
    expect(sizeOf("\\sqrt{x^{2}}")).toBe("s");
    expect(sizeOf("\\sqrt{\\left(9+16\\right)}")).toBe("s");
  });

  it("takes the middle one for a fraction", () => {
    expect(sizeOf("\\sqrt{\\frac{1}{2}}")).toBe("m");
    expect(sizeOf("\\sqrt{1+\\frac{1}{2}}")).toBe("m");
  });

  it("takes the largest for anything deeper than that", () => {
    expect(sizeOf("\\sqrt{\\frac{\\frac{1}{2}}{3}}")).toBe("l");
  });

  it("sizes each root by what it covers, so a root inside a root is the larger of the two", () => {
    expect(sizesIn("\\sqrt{\\sqrt{\\frac{1}{2}}}")).toEqual(["l", "m"]);
    expect(sizesIn("\\sqrt{2}+\\sqrt{\\frac{1}{2}}")).toEqual(["s", "m"]);
  });
});

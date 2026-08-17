// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type FormulaNode, branchesOf, decodePath, isText, resolve, resolveArray } from "./model";
import { parseLatex } from "./parse";
import { CARET_PLACEHOLDER, renderNodes, rootGrowth } from "./render";

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
      ".math-input__root", ".math-input__root--indexed", ".math-input__root-body", ".math-input__root-symbol",
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

describe("the size of a script", () => {
  const scriptSizes = (latex: string) => [...draw(parseLatex(latex)).querySelectorAll<HTMLElement>(".math-input__slot--exponent, .math-input__slot--subscript")]
    .map((slot) => slot.getAttribute("style")?.match(/max\(([\d.]+)em/)?.[1]);

  it("sets a script smaller than what it rides on", () => {
    expect(scriptSizes("x^{2}")).toEqual(["0.720"]);
    expect(scriptSizes("x_{i}")).toEqual(["0.720"]);
  });

  it("descends two rungs and then holds, so a script of a script of a script stays legible", () => {
    // Relative steps, because `em` compounds them: 1 → 0.72 → 0.55, and 0.55 thereafter.
    expect(scriptSizes("x^{y^{z}}")).toEqual(["0.720", "0.764"]);
    expect(scriptSizes("x^{y^{z^{w}}}")).toEqual(["0.720", "0.764", "1.000"]);
    expect(scriptSizes("x^{y^{z^{w^{v}}}}")).toEqual(["0.720", "0.764", "1.000", "1.000"]);
  });

  it("counts rungs rather than nesting, so a fraction inside a script does not shrink again", () => {
    // Only a script slot is a rung. The numerator of a fraction sitting in an exponent is set
    // at the exponent's size, not one smaller.
    expect(scriptSizes("x^{\\frac{a^{b}}{c}}")).toEqual(["0.720", "0.764"]);
  });

  it("never sets a script below a size anyone can read", () => {
    const floors = [...draw(parseLatex("x^{y^{z}}")).querySelectorAll<HTMLElement>(".math-input__slot--exponent")]
      .map((slot) => slot.getAttribute("style"));
    for (const style of floors) expect(style).toContain("11px");
  });
});

/**
 * This was written against three radicals chosen between by two thresholds. There are no
 * sizes to choose between now: the weight is a function of what the root covers, which says
 * the same thing about a root over a fraction being heavier than one over a digit without
 * also saying that every root between one and a half lines and two and a third is drawn as
 * though it were exactly two.
 */
describe("the weight of a radical", () => {
  const radicandsIn = (nodes: FormulaNode[]): FormulaNode[][] =>
    nodes.flatMap((node) => (node.type === "sqrt" ? [node.content, ...radicandsIn(node.content)] : node.type === "text" ? [] : branchesOf(node).flatMap((branch) => radicandsIn(branch.nodes))));
  const weightsIn = (latex: string) => radicandsIn(parseLatex(latex)).map((radicand) => rootGrowth(radicand).stroke);
  const weightOf = (latex: string) => weightsIn(latex)[0];

  it("draws a root over one line of writing at the weight the host set, however long the line", () => {
    expect(weightOf("\\sqrt{9}")).toBe(1);
    expect(weightOf("\\sqrt{9+16+25}")).toBe(1);
    expect(weightOf("\\sqrt{\\left(9+16\\right)}")).toBe(1);
  });

  it("grows with what it covers rather than stepping between sizes", () => {
    const script = weightOf("\\sqrt{x^{2}}");
    const fraction = weightOf("\\sqrt{\\frac{1}{2}}");
    const deeper = weightOf("\\sqrt{\\frac{\\frac{1}{2}}{3}}");
    expect(script).toBeGreaterThan(1);
    expect(fraction).toBeGreaterThan(script);
    expect(deeper).toBeGreaterThan(fraction);
    // A script raises a root by less than a fraction does, because it is shorter — under the
    // old thresholds both a script and a bare digit were drawn identically.
    expect(script - 1).toBeLessThan(fraction - script);
    // Equal heights weigh the same, whatever they are made of.
    expect(weightOf("\\sqrt{x^{2}}")).toBe(weightOf("\\sqrt{y_{i}}"));
  });

  it("weighs each root by its own radicand, so a root inside a root is the heavier of the two", () => {
    const [outer, inner] = weightsIn("\\sqrt{\\sqrt{\\frac{1}{2}}}");
    expect(outer).toBeGreaterThan(inner);
    const [first, second] = weightsIn("\\sqrt{2}+\\sqrt{\\frac{1}{2}}");
    expect(second).toBeGreaterThan(first);
  });

  it("hands the drawing two multipliers, which is what the two public properties are scaled by", () => {
    const root = draw(parseLatex("\\sqrt{\\frac{1}{2}}")).querySelector<HTMLElement>(".math-input__root")!;
    const style = root.getAttribute("style") ?? "";
    // The stylesheet multiplies `--math-input-rule` and `--math-input-root-width` by these, so
    // a host that sets either keeps the whole range of sizes in proportion.
    expect(style).toContain("--_root-stroke-grow");
    expect(style).toContain("--_root-width-grow");
    expect(style).toContain("--_root-index-drop");
    // A root over one line is drawn at exactly what the host set: the multipliers are 1.
    const plain = draw(parseLatex("\\sqrt{9}")).querySelector<HTMLElement>(".math-input__root")!;
    expect(plain.getAttribute("style")?.replace(/\s/g, "")).toContain("--_root-stroke-grow:1;");
  });

  it("stops growing, because a root over a page of working is a tall radical and not a thick one", () => {
    const deep = parseLatex("\\sqrt{\\frac{\\frac{\\frac{1}{2}}{3}}{\\frac{\\frac{4}{5}}{6}}}");
    const growth = rootGrowth(radicandsIn(deep)[0]);
    expect(growth.stroke).toBe(2.4);
    expect(growth.width).toBe(3);
  });
});

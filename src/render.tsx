import { type ReactNode } from "react";
import { type BranchKey, type FormulaNode, type Path, branchesOf, encodePath, isBlank, slotPath } from "./model";

/**
 * Renders a formula tree as real JSX. Every element carries a `data-path` holding the
 * position it stands for, which is the only channel selection.ts uses to translate
 * between caret positions and DOM ranges — nothing here mutates the DOM.
 */

/**
 * An empty text run still has to be somewhere the caret can go, and a browser gives a
 * range inside an empty element no geometry at all — measured, not assumed. So empty runs
 * render one zero-width character. Unlike the anchor character this replaces, it is a pure
 * function of the tree rather than something stitched into a live DOM.
 */
export const CARET_PLACEHOLDER = "​";

const SLOT_MODIFIER: Record<string, string> = {
  "sqrt:content": "radicand",
  "sqrt:index": "root-index",
  "frac:numerator": "numerator",
  "frac:denominator": "denominator",
  "power:base": "base",
  "power:exponent": "exponent",
  "subscript:base": "base",
  "subscript:subscript": "subscript",
  "group:content": "group",
};

function Slot({ node, branch, path }: { node: FormulaNode; branch: BranchKey; path: Path }) {
  const nodes = branchesOf(node).find((candidate) => candidate.key === branch)?.nodes ?? [];
  const here = slotPath(path, branch);
  // `data-blank` drives the dotted placeholder: a slot is never CSS-`:empty`, it always holds a text run.
  return <span className={`math-input__slot math-input__slot--${SLOT_MODIFIER[`${node.type}:${branch}`]}`} data-slot={branch} data-path={encodePath(here)} data-blank={isBlank(nodes) ? "" : undefined}>{renderNodes(nodes, here)}</span>;
}

/**
 * Stretches to the height of its slot, so nested fractions get tall brackets. The span
 * matters: an SVG is a replaced element, so as a direct flex item its 1:10 aspect ratio
 * would size the whole group instead of the other way round.
 */
const Paren = ({ side }: { side: "left" | "right" }) =>
  <span className={`math-input__paren math-input__paren--${side}`} aria-hidden="true">
    <svg viewBox="0 0 10 100" preserveAspectRatio="none" fill="none">
      <path d={side === "left" ? "M8 1 C3.5 26 3.5 74 8 99" : "M2 1 C6.5 26 6.5 74 2 99"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  </span>;

/**
 * How tall what a root covers stands, in lines of ordinary text.
 *
 * A fraction is its two halves stacked; a script rides part of a line above or below its
 * base; a root adds its own bar to what it covers. Read off the tree rather than measured
 * off the page, so rendering stays a pure function of the document — nothing is drawn,
 * measured and then drawn again on every keystroke.
 */
export function linesIn(nodes: FormulaNode[]): number {
  return Math.max(1, ...nodes.map((node) => {
    switch (node.type) {
      case "text": return 1;
      case "frac": return linesIn(node.numerator) + linesIn(node.denominator);
      case "power": return linesIn(node.base) + 0.4 * linesIn(node.exponent);
      case "subscript": return linesIn(node.base) + 0.4 * linesIn(node.subscript);
      case "group": return linesIn(node.content);
      case "sqrt": return linesIn(node.content) + 0.35;
    }
  }));
}

/**
 * Which of the three radicals a root wears: over a number or a word, over a fraction, or
 * over anything deeper. The drawing stretches to whatever it covers, so the size decides
 * the weight of the stroke rather than the height — a radical over a stack of fractions
 * drawn in the same hairline as one over a digit reads as a different mark altogether.
 */
export const rootSize = (nodes: FormulaNode[]): "s" | "m" | "l" => {
  const lines = linesIn(nodes);
  return lines <= 1.5 ? "s" : lines <= 2.3 ? "m" : "l";
};

/**
 * The radical, drawn rather than set: a check mark whose box is exactly as tall as what
 * the root covers, stretched vertically and never re-proportioned, with a stroke that
 * keeps its width while the box changes shape. A character would need a font full of
 * sizes to fit as closely, and would move whenever the host changed the maths font.
 *
 * The bar over the radicand is that slot's own top border, in the same width — and the
 * box is dropped by half of it, so the stroke ending at the box's top corner covers
 * exactly the band the border draws and the two are one line.
 */
const RootSymbol = () =>
  <svg className="math-input__root-symbol" viewBox="0 0 24 100" preserveAspectRatio="none" fill="none" aria-hidden="true">
    <path d="M0 53 L5 59 L10.5 100 L24 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>;

function renderNode(node: FormulaNode, path: Path): ReactNode {
  const key = encodePath(path);
  const slot = (branch: BranchKey) => <Slot key={branch} node={node} branch={branch} path={path} />;
  switch (node.type) {
    case "text":
      // Rendered as an element so it has an address; React writes the run as its only text child.
      return <span key={key} className="math-input__text" data-path={key} data-blank={node.value === "" ? "" : undefined}>{node.value === "" ? CARET_PLACEHOLDER : node.value}</span>;
    case "sqrt":
      // A cube root is the same drawing with its index beside it, which is why the index
      // is the root's own child rather than the body's: it sits outside the radical.
      return <span key={key} className={`math-input__root math-input__root--${rootSize(node.content)}${node.index === null ? "" : " math-input__root--indexed"}`} data-math="sqrt" data-path={key}>
        {node.index === null ? null : slot("index")}
        <span className="math-input__root-body"><RootSymbol />{slot("content")}</span>
      </span>;
    case "frac":
      return <span key={key} className="math-input__fraction" data-math="frac" data-path={key}>{slot("numerator")}{slot("denominator")}</span>;
    case "power":
      return <span key={key} className="math-input__power" data-math="power" data-path={key}>{slot("base")}{slot("exponent")}</span>;
    case "subscript":
      return <span key={key} className="math-input__subscript" data-math="subscript" data-path={key}>{slot("base")}{slot("subscript")}</span>;
    case "group":
      return <span key={key} className="math-input__group" data-math="group" data-path={key}><Paren side="left" />{slot("content")}<Paren side="right" /></span>;
  }
}

export const renderNodes = (nodes: FormulaNode[], path: Path = []): ReactNode => nodes.map((node, index) => renderNode(node, [...path, { index }]));

import { type ReactNode } from "react";
import { type BranchKey, type FormulaNode, type Path, branchesOf, encodePath, isBlank } from "./model";

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

/** A node's own path with `branch` appended to its last step: the address of one of its slots. */
const slotPath = (path: Path, branch: BranchKey): Path => [...path.slice(0, -1), { ...path[path.length - 1], branch }];

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

const RootSymbol = () =>
  <svg className="math-input__root-symbol" fill="none" aria-hidden="true">
    <path d="M1 16.5 7.4 25 18 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="18" y1="2" x2="100%" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;

function renderNode(node: FormulaNode, path: Path): ReactNode {
  const key = encodePath(path);
  const slot = (branch: BranchKey) => <Slot key={branch} node={node} branch={branch} path={path} />;
  switch (node.type) {
    case "text":
      // Rendered as an element so it has an address; React writes the run as its only text child.
      return <span key={key} className="math-input__text" data-path={key} data-blank={node.value === "" ? "" : undefined}>{node.value === "" ? CARET_PLACEHOLDER : node.value}</span>;
    case "sqrt":
      // The body is the radical symbol's positioning context, so an index can sit beside it.
      return <span key={key} className={`math-input__root${node.index === null ? "" : " math-input__root--indexed"}`} data-math="sqrt" data-path={key}>
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

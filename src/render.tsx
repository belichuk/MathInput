import { type ReactNode } from "react";
import { type BranchKey, type CompoundNode, type FormulaNode, type Path, branchesOf, encodePath, isBlank, slotPath, stepOf } from "./model";
import { slotCodeOf, specFor } from "./registry";

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

/**
 * The characters mathematics sets with air around them, and how much of it.
 *
 * TeX puts a medium space either side of a binary operator and a thick one either side of a
 * relation, and without that `2+3` reads as one run of ink rather than an addition. A font
 * cannot supply it: the sidebearings of `+` are the same wherever it appears, and whether a
 * given `+` is an operation at all depends on what is in front of it.
 *
 * Which is the whole subtlety here. A sign with no term before it is a sign and not an
 * operation — the minus of `-b`, or of `2⋅-3`, belongs to the number and takes no space.
 * `afterTerm` says whether something precedes this run in its sequence, which by the
 * alternation invariant means a construct: the `-` of `\frac{1}{2}-3` is subtraction, while
 * the `-` opening a numerator is a negative.
 */
const OPERATORS = "+-−⋅×÷:";
const RELATIONS = "=≠<>≤≥";

export type RunToken = { text: string; kind: "plain" | "operator" | "relation" };

export function tokeniseRun(value: string, afterTerm: boolean): RunToken[] {
  const tokens: RunToken[] = [];
  let plain = "";
  // A stand-in for the term a preceding construct is, so the first character can be judged
  // by the same rule as every other one.
  let previous: string | null = afterTerm ? "0" : null;
  const flush = () => { if (plain !== "") { tokens.push({ text: plain, kind: "plain" }); plain = ""; } };

  for (const character of value) {
    const relation = RELATIONS.includes(character);
    const operates = previous !== null && !OPERATORS.includes(previous) && !RELATIONS.includes(previous);
    previous = character;
    if (relation || (operates && OPERATORS.includes(character))) {
      flush();
      tokens.push({ text: character, kind: relation ? "relation" : "operator" });
      continue;
    }
    plain += character;
  }
  flush();
  return tokens;
}

function Slot({ node, branch, path }: { node: CompoundNode; branch: BranchKey; path: Path }) {
  const nodes = branchesOf(node).find((candidate) => candidate.key === branch)?.nodes ?? [];
  const here = slotPath(path, branch);
  // `data-blank` drives the dotted placeholder: a slot is never CSS-`:empty`, it always holds a text run.
  return <span className={`math-input__slot math-input__slot--${slotCodeOf(node.type, branch)}`} data-slot={branch} data-path={encodePath(here)} data-blank={isBlank(nodes) ? "" : undefined}>{renderNodes(nodes, here)}</span>;
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
  return Math.max(1, ...nodes.map((node) => (node.type === "text" ? 1 : specFor(node).lines(node, linesIn))));
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
  if (node.type === "text") {
    /**
     * Rendered as an element so it has an address. A run with nothing to space is still one
     * text node, exactly as before — which keeps the common case unchanged and its
     * translation back into a model position a single step. A run holding an operation is
     * split at each side of it, and the addressed element is still the run: the spans inside
     * carry no address of their own, and `selection.ts` walks across them.
     */
    const tokens = node.value === "" ? [] : tokeniseRun(node.value, stepOf(path).index > 0);
    const plain = tokens.length === 1 && tokens[0].kind === "plain";
    return <span key={key} className="math-input__text" data-path={key} data-blank={node.value === "" ? "" : undefined}>
      {node.value === "" || plain
        ? (node.value === "" ? CARET_PLACEHOLDER : node.value)
        : tokens.map((token, at) => (token.kind === "plain"
          ? token.text
          : <span key={at} className={`math-input__token math-input__token--${token.kind}`}>{token.text}</span>))}
    </span>;
  }

  // Past the run, the node is a construct — which is what lets a slot be addressed by the
  // registry's name for it rather than by a per-kind table.
  const slot = (branch: BranchKey) => <Slot key={branch} node={node} branch={branch} path={path} />;
  switch (node.type) {
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

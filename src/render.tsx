import { type CSSProperties, type ReactNode } from "react";
import { type BranchKey, type CompoundNode, type FormulaNode, type Path, branchOf, branchesOf, encodePath, isBlank, slotPath, stepOf } from "./model";
import { type AnyDraw, type FenceShape, slotOf, specFor } from "./registry";

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
const DIGITS = "0123456789.,";

/**
 * The four things a character can be, beyond ordinary text: a quantity, a name standing for
 * one, an operation between two of them, or a claim about them. Mathematics sets each
 * differently — digits upright and figure-width, letters italic, operations and relations
 * with air around them — and none of it is something a font does on its own.
 */
export type RunToken = { text: string; kind: "plain" | "operator" | "relation" | "variable" | "number" };

const classOf = (character: string, operates: boolean): RunToken["kind"] => {
  if (RELATIONS.includes(character)) return "relation";
  if (OPERATORS.includes(character)) return operates ? "operator" : "plain";
  if (DIGITS.includes(character)) return "number";
  return /[A-Za-z]/.test(character) ? "variable" : "plain";
};

export function tokeniseRun(value: string, afterTerm: boolean): RunToken[] {
  const tokens: RunToken[] = [];
  // A stand-in for the term a preceding construct is, so the first character can be judged
  // by the same rule as every other one.
  let previous: string | null = afterTerm ? "0" : null;

  for (const character of value) {
    const operates = previous !== null && !OPERATORS.includes(previous) && !RELATIONS.includes(previous);
    previous = character;
    const kind = classOf(character, operates);
    const last = tokens[tokens.length - 1];
    // A sign is its own token every time, because the space belongs to that one character.
    // Everything else runs together for as long as its class holds: `12.5` is one number.
    if (last && last.kind === kind && kind !== "operator" && kind !== "relation") last.text += character;
    else tokens.push({ text: character, kind });
  }
  return tokens;
}

/**
 * A run whose text is all one class needs no span inside it: the run element carries the
 * class itself and keeps its single text node.
 *
 * Which matters more than it sounds. Once letters and digits are classed too, almost every
 * run is *some* class, and a span per run would mean the bridge walking children for every
 * position in the document rather than for the few runs that hold an operation. This keeps
 * `x` and `12.5` exactly as cheap to address as they were before any of this.
 */
export const wholeRun = (tokens: RunToken[]): RunToken | null => (tokens.length === 1 ? tokens[0] : null);

/**
 * A run as it is *set*, which is not quite as it is stored.
 *
 * A keyboard has a hyphen and mathematics has a minus, and they are different characters:
 * U+2212 is drawn to the width of a plus and sits at the same height, where a hyphen is short
 * and low and reads as a word-break. Only the drawing changes — the model keeps the hyphen the
 * user typed and `serialize.ts` writes it, so the LaTeX is unchanged and every offset still
 * counts the same characters, U+2212 being one character exactly as `-` is.
 */
export const asSet = (text: string): string => text.replace(/-/g, "−");
const tokenClass = (token: RunToken | null): string => (token && token.kind !== "plain" ? ` math-input__token--${token.kind}` : "");

/**
 * The ladder a script is set on: full size, then 0.72, then 0.55, and then no smaller.
 *
 * TeX descends two rungs and holds, and holding is the whole point. Scripts nest — `x^{y^{z}}`
 * is ordinary enough — and a plain `0.72em` on each one compounds, so four levels down a
 * 24px field was setting text at 6px. It also stops at 11px however small the field itself is,
 * because a size nobody can read is not a size.
 *
 * Each step is expressed relative to the step above it, which is what lets `em` do the
 * compounding and the ladder decide when to stop compounding.
 */
const SCRIPT_LADDER = [1, 0.72, 0.55];
const scriptStep = (depth: number): number => {
  const rung = (at: number) => SCRIPT_LADDER[Math.min(at, SCRIPT_LADDER.length - 1)];
  return rung(depth + 1) / rung(depth);
};

function Slot({ node, branch, path, depth }: { node: CompoundNode; branch: BranchKey; path: Path; depth: number }) {
  const nodes = branchesOf(node).find((candidate) => candidate.key === branch)?.nodes ?? [];
  const here = slotPath(path, branch);
  const slot = slotOf(node.type, branch);
  const scripted = slot?.script === true;
  // `data-blank` drives the dotted placeholder: a slot is never CSS-`:empty`, it always holds a text run.
  return <span
    className={`math-input__slot math-input__slot--${slot?.code ?? ""}`}
    style={scripted ? { fontSize: `max(${scriptStep(depth).toFixed(3)}em, 11px)` } : undefined}
    data-slot={branch}
    data-path={encodePath(here)}
    data-blank={isBlank(nodes) ? "" : undefined}
  >{renderNodes(nodes, here, scripted ? depth + 1 : depth)}</span>;
}

/**
 * Stretches to the height of its slot, so nested fractions get tall brackets. The span
 * matters: an SVG is a replaced element, so as a direct flex item its 1:10 aspect ratio
 * would size the whole group instead of the other way round.
 */
const FENCES: Record<FenceShape, { left: string; right: string }> = {
  paren: { left: "M8 1 C3.5 26 3.5 74 8 99", right: "M2 1 C6.5 26 6.5 74 2 99" },
  bracket: { left: "M8 1 H3 V99 H8", right: "M2 1 H7 V99 H2" },
  // A brace turns twice and pinches at the middle, which is the whole of its character.
  brace: { left: "M8 1 C5 1 5 12 5 30 C5 44 3 48 1 50 C3 52 5 56 5 70 C5 88 5 99 8 99", right: "M2 1 C5 1 5 12 5 30 C5 44 7 48 9 50 C7 52 5 56 5 70 C5 88 5 99 2 99" },
  bar: { left: "M5 1 V99", right: "M5 1 V99" },
};

const Fence = ({ shape, side }: { shape: FenceShape; side: "left" | "right" }) =>
  <span className={`math-input__paren math-input__paren--${side}`} aria-hidden="true">
    <svg viewBox="0 0 10 100" preserveAspectRatio="none" fill="none">
      <path d={FENCES[shape][side]} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
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
 * How heavily a radical is drawn, and how far it reaches before its bar begins — as a
 * function of what it covers rather than as one of three sizes to be chosen between.
 *
 * The drawing stretches to whatever it covers, so what the height settles is the *weight*: a
 * radical over a stack of fractions drawn in the same hairline as one over a digit reads as a
 * different mark altogether. That was three tiers with a threshold either side of them, and a
 * threshold shows: two roots a hair apart in height were drawn in visibly different weights,
 * and every root between 1.5 and 2.3 lines was drawn as though it were exactly two.
 *
 * Both grow from the value at one line, which is what the two public properties set, and both
 * stop growing — a root over eight lines of working is a tall radical and not a thick one.
 * Returned as multipliers so the host's own `--math-input-root-stroke` still means what it
 * says: this scales it rather than replacing it.
 *
 * `linesIn` is read off the tree and nothing here measures the page (invariant 4).
 */
export const rootGrowth = (nodes: FormulaNode[]): { stroke: number; width: number; indexDrop: number } => {
  const over = linesIn(nodes) - 1;
  return {
    stroke: Math.min(1 + 0.41 * over, 2.4),
    width: Math.min(1 + 0.59 * over, 3),
    // How far the index sits below the top of the radical, in its own em. The crook it tucks
    // into is a fraction of the height, so the taller the root the further down it is — this
    // was three hand-set offsets, one of which was a guess at a size the corpus had no
    // example of.
    indexDrop: Math.min(0.6 + 0.75 * over, 3.6),
  };
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

function renderNode(node: FormulaNode, path: Path, depth: number): ReactNode {
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
    const whole = wholeRun(tokens);
    // A blank run draws one zero-width character so the caret has somewhere with geometry to
    // stand. It is no part of the model's text and no part of what the field says, so it is
    // kept out of the accessibility tree — a screen reader reading an empty row should find it
    // empty rather than find a character it cannot pronounce.
    return <span key={key} className={`math-input__text${tokenClass(whole)}`} data-path={key} data-blank={node.value === "" ? "" : undefined} aria-hidden={node.value === "" ? true : undefined}>
      {node.value === "" ? CARET_PLACEHOLDER : whole
        ? asSet(whole.text)
        : tokens.map((token, at) => (token.kind === "plain"
          ? asSet(token.text)
          : <span key={at} className={`math-input__token${tokenClass(token)}`}>{asSet(token.text)}</span>))}
    </span>;
  }

  // Past the run, the node is a construct — drawn as the shape its registry row names rather
  // than as markup of its own. A construct the renderer has never heard of is not a thing that
  // can happen: it has a row, and a row names a shape.
  const slot = (branch: BranchKey) => <Slot key={branch} node={node} branch={branch} path={path} depth={depth} />;
  const { className, children, style } = draw(node, specFor(node).draw, slot);
  return <span key={key} className={className} style={style} data-math={node.type} data-path={key}>{children}</span>;
}

/**
 * The layout shapes, which are fewer than the constructs: a power and a subscript are the same
 * arrangement and differ only in what the stylesheet does with the slot underneath.
 *
 * Returning the class rather than the whole element keeps the address and `data-math` in one
 * place above, so a shape cannot forget to carry them.
 */
function draw(node: CompoundNode, shape: AnyDraw, slot: (branch: BranchKey) => ReactNode): { className: string; children: ReactNode; style?: CSSProperties } {
  switch (shape.primitive) {
    case "stack":
      return { className: shape.className, children: <>{slot(shape.above)}{slot(shape.below)}</> };
    case "attach":
      return { className: shape.className, children: <>{slot(shape.base)}{slot(shape.script)}</> };
    case "fence":
      return { className: shape.className, children: <><Fence shape={shape.shape} side="left" />{slot(shape.content)}<Fence shape={shape.shape} side="right" /></> };
    case "radical": {
      // A cube root is the same drawing with its index beside it, which is why the index is
      // the root's own child rather than the body's: it sits outside the radical.
      const radicand = branchOf(node, shape.radicand) ?? [];
      const indexed = shape.index !== undefined && branchOf(node, shape.index) !== null;
      const growth = rootGrowth(radicand);
      return {
        className: `${shape.className}${indexed ? ` ${shape.className}--indexed` : ""}`,
        // The one place the renderer writes numbers into the document, and they are numbers
        // read off the tree rather than off the page: a pure function of the node, like every
        // other thing here. Private names, because how a root's weight is arrived at is not a
        // contract — the two properties they scale are.
        style: { "--_root-stroke-grow": growth.stroke, "--_root-width-grow": growth.width, "--_root-index-drop": `${growth.indexDrop}em` } as CSSProperties,
        children: <>
          {indexed && shape.index !== undefined ? slot(shape.index) : null}
          <span className="math-input__root-body"><RootSymbol />{slot(shape.radicand)}</span>
        </>,
      };
    }
  }
}

/** `depth` is how many rungs down the script ladder this sequence is set. */
export const renderNodes = (nodes: FormulaNode[], path: Path = [], depth = 0): ReactNode => nodes.map((node, index) => renderNode(node, [...path, { index }], depth));

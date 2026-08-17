import { type FormulaNode, type Path, branchesOf, isText, resolve } from "./model";
import { type ConstructKind, specFor } from "./registry";
import { tokeniseRun } from "./render";

/**
 * The formula in words.
 *
 * A screen reader given the field's contents reads what is in the DOM, and what is in the DOM
 * is `x`, `2`, `1`, `2` in boxes — the structure that makes those a squared term over a
 * fraction is drawn, and a drawing is not something a reader can say. So the field carries a
 * description written from the tree, and the tree is the only thing consulted: this module
 * never touches the DOM, never measures anything, and is tested with no DOM at all.
 *
 * ## Why the readings are here and not in the registry
 *
 * Every other layer reads `registry.ts`, and a construct's row is what gives it slots, caret
 * behaviour, height, styling and LaTeX. Speech is deliberately not a column in that table, for
 * one reason: these are the only English sentences the component says, and a locale option —
 * which is a real request and not a hypothetical one — needs them in a single place it can
 * replace. The guarantee the registry gives is kept all the same. `SPOKEN` is checked against
 * `Record<ConstructKind, Reading>`, so a construct added to the registry without a reading is
 * a compile error, exactly as a construct added without a `draw` is.
 *
 * ## What this is not
 *
 * It is not MathSpeak, and it is not a standard. It is a plain reading of what is on the
 * screen, bracketed where a listener would otherwise lose the end of a fraction. Where a
 * reading would be ambiguous it says more rather than less: `x^{2}` is "x squared", but
 * `x^{n+1}` is "x to the power of n plus 1, end power", because "x to the power of n plus 1"
 * alone does not say where the exponent stopped.
 */

/** A construct's slots, already read, keyed by slot. An absent optional slot is absent here too. */
type Said = Partial<Record<string, string>>;
type Reading = (said: Said) => string;

/** What a blank slot is called, which is what makes an unfinished formula readable at all. */
const BLANK = "blank";

/**
 * Every word this component says, in one table.
 *
 * Q-8 asked whether the strings should be externalised from the start. They are not — a
 * locale prop is an API decision and this release is already spending its breaking window on
 * the toolbar — but they are all *here*, so answering Q-8 later is a matter of choosing how a
 * host supplies a replacement, not of finding forty strings scattered through five files.
 */
const SPOKEN_CHARACTERS: Record<string, string> = {
  "+": "plus",
  "-": "minus",
  "−": "minus",
  "⋅": "times",
  "×": "times",
  "÷": "divided by",
  ":": "divided by",
  "=": "equals",
  "≠": "is not equal to",
  "<": "is less than",
  ">": "is greater than",
  "≤": "is less than or equal to",
  "≥": "is greater than or equal to",
};

const SPOKEN = {
  // "the square root of 9, end root" rather than "root 9": a listener needs to hear where the
  // radicand stopped, and the radical's whole job on the page is to show that visually.
  sqrt: (said) => `the ${said.index === undefined ? "square" : said.index === "3" ? "cube" : `${said.index}`} root of ${said.content}, end root`,
  frac: (said) => `the fraction ${said.numerator} over ${said.denominator}, end fraction`,
  // A square and a cube are said the way anyone says them; anything longer is bracketed.
  power: (said) => (said.exponent === "2" ? `${said.base} squared` : said.exponent === "3" ? `${said.base} cubed` : `${said.base} to the power of ${said.exponent}, end power`),
  subscript: (said) => `${said.base} sub ${said.subscript}`,
  group: (said) => `open bracket ${said.content} close bracket`,
} satisfies Record<ConstructKind, Reading>;

/**
 * A run of characters, read by what each character *is* rather than by what it looks like.
 *
 * The tokeniser is the renderer's, and using it twice is the point: the `-` that is set with
 * space around it because it subtracts is the same `-` that is read "minus", and the one
 * opening a numerator is neither spaced nor read as an operation. A second classifier here
 * would be a second answer to a question that already has one.
 */
function speakRun(value: string, afterTerm: boolean): string {
  // Silent, not "blank". The alternation invariant puts an empty run at both ends of every
  // array and between any two constructs, so a run with nothing in it is the ordinary case
  // rather than the interesting one — whether a *slot* is blank is decided over the whole
  // array, in `speakNodes`.
  if (value === "") return "";
  return tokeniseRun(value, afterTerm)
    .map((token) => {
      // A sign that operates is an operation; the same character standing in front of a term
      // is its sign, which is a different word.
      if (token.kind === "plain" && (token.text === "-" || token.text === "−")) return "negative";
      return SPOKEN_CHARACTERS[token.text] ?? token.text;
    })
    .join(" ");
}

/** One node, and then its neighbours: a run reads on from whatever stood in front of it. */
function speakNode(node: FormulaNode, afterTerm: boolean): string {
  if (isText(node)) return speakRun(node.value, afterTerm);
  const said: Said = {};
  for (const branch of branchesOf(node)) said[branch.key] = speakNodes(branch.nodes);
  return (SPOKEN as Record<string, Reading>)[node.type](said);
}

export function speakNodes(nodes: FormulaNode[]): string {
  const said = nodes
    .map((node, index) => speakNode(node, index > 0))
    .filter((part) => part !== "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  // Nothing written here at all: which slot it is, is the caller's business, but that it is
  // waiting to be filled in is most of what an editor has to say.
  return said === "" ? BLANK : said;
}

/** The row as one sentence, or what an empty row is called. */
export const speakRow = (nodes: FormulaNode[]): string => {
  const said = speakNodes(nodes);
  return said === BLANK ? "empty" : said;
};

/**
 * Where the caret is, in the words a listener needs.
 *
 * Announced when it changes and not otherwise, because the interesting fact is never "still in
 * the denominator" — it is *entering* one. The slot names come from the registry's own `code`
 * for each slot, so a construct added there is announced without this table being touched; a
 * code with no phrase reads as itself, which is a plain word in every case so far.
 */
const SPOKEN_SLOTS: Record<string, string> = {
  radicand: "in the root",
  "root-index": "in the root index",
  numerator: "in the numerator",
  denominator: "in the denominator",
  base: "at the base",
  exponent: "in the exponent",
  subscript: "in the subscript",
  group: "in the brackets",
};

/**
 * The slot a position sits in, read from the path alone.
 *
 * The path is a list of steps into the tree, and the last one that names a branch is the slot
 * the caret is in — everything after it is an index within that slot. Nothing is measured and
 * nothing is looked up on the page, which is invariant 4: no editing decision, and no
 * announcement about one, comes from reading the layout.
 */
export function slotAt(nodes: FormulaNode[], path: Path): string | null {
  for (let at = path.length - 1; at >= 0; at -= 1) {
    const branch = path[at].branch;
    if (branch === undefined) continue;
    // The construct the branch belongs to: the same path with that final descent removed.
    const found = resolve(nodes, [...path.slice(0, at), { index: path[at].index }]);
    const owner = found && found.array[found.index];
    if (!owner || isText(owner)) return null;
    const slot = specFor(owner).slots.find((candidate) => candidate.key === branch);
    return slot ? SPOKEN_SLOTS[slot.code] ?? slot.code : null;
  }
  return null;
}

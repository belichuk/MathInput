import { type FormulaNode, TIMES } from "./model";

/**
 * `\cdot` always takes a trailing space: whatever follows may be a letter — including one
 * that lives in the next node entirely, such as the base of `x_{i}` — and `\cdotx` is not
 * a command. Parsing drops the space again, so the value stays stable across round trips.
 */
const serializeText = (value: string): string => value.split(TIMES).join("\\cdot ");

function serializeNode(node: FormulaNode): string {
  switch (node.type) {
    case "text": return serializeText(node.value);
    case "sqrt": return node.index === null ? `\\sqrt{${serializeToLatex(node.content)}}` : `\\sqrt[${serializeToLatex(node.index)}]{${serializeToLatex(node.content)}}`;
    case "frac": return `\\frac{${serializeToLatex(node.numerator)}}{${serializeToLatex(node.denominator)}}`;
    case "power": return `${serializeToLatex(node.base)}^{${serializeToLatex(node.exponent)}}`;
    case "subscript": return `${serializeToLatex(node.base)}_{${serializeToLatex(node.subscript)}}`;
    case "group": return `\\left(${serializeToLatex(node.content)}\\right)`;
  }
}

/**
 * Every sequence's LaTeX, remembered against the sequence itself.
 *
 * The editor asks for the whole document's LaTeX after every keystroke, to hand to
 * `onChange`. Without this that is every row of a worksheet written out again — fifty trees
 * walked and fifty strings built — for an edit that changed one run of characters in one of
 * them.
 *
 * A `WeakMap` keyed on the array is the right cache because the tree is immutable and
 * structurally shared: an edit rebuilds the spine from the edited run up to the row and
 * leaves every other array the same object, so those arrays are hits by identity and their
 * strings are never rebuilt. It works at every depth, not only per row — the recursion below
 * comes back through this function — so even the edited row is rewritten only along the path
 * that changed. Entries go when the arrays do, which is what makes the undo history's two
 * hundred snapshots the bound on this rather than a leak.
 *
 * The precondition is the one the whole model already keeps: **a `FormulaNode[]` that has
 * been handed out is never mutated.** Reducers rebuild; nothing assigns into an array or
 * writes a field on a node.
 */
const written = new WeakMap<FormulaNode[], string>();

/** Renders a formula tree back to KaTeX-compatible source. */
export function serializeToLatex(nodes: FormulaNode[]): string {
  const remembered = written.get(nodes);
  if (remembered !== undefined) return remembered;
  const latex = nodes.map(serializeNode).join("");
  written.set(nodes, latex);
  return latex;
}

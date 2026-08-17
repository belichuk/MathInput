/** Test-only helpers. Not part of the component's runtime. */
import { type BranchKey, type CaretPosition, type CompoundNode, type FormulaNode, type Path, type SelectionRange, arrayPathOf, branchesOf, buildConstruct, collapsedAt, isText, normalize, resolve, text, updateArray } from "./model";
import { type ConstructKind, CONSTRUCTS, specOf } from "./registry";
import { rowStart } from "./caret";
import { parseLatex } from "./parse";
import { serializeToLatex } from "./serialize";
import type { RowState } from "./reducers";

export const at = (path: Path, offset = 0): CaretPosition => ({ path, offset });
export const top = (index: number, offset = 0): CaretPosition => at([{ index }], offset);
export const inside = (index: number, branch: BranchKey, innerIndex: number, offset = 0): CaretPosition => at([{ index, branch }, { index: innerIndex }], offset);
export const rangeOf = (anchor: CaretPosition, focus: CaretPosition): SelectionRange => ({ anchor, focus });

export const rowOf = (latex: string, position: CaretPosition = rowStart()): RowState => ({ content: parseLatex(latex), selection: collapsedAt(position) });
export const rowSelecting = (latex: string, anchor: CaretPosition, focus: CaretPosition): RowState => ({ content: parseLatex(latex), selection: rangeOf(anchor, focus) });

/** The row's LaTeX with `|` where the caret is — readable expectations instead of raw paths. */
export function sketch(state: RowState, position: CaretPosition = state.selection.focus): string {
  const target = resolve(state.content, position.path);
  const node = target?.array[target.index];
  if (!target || !isText(node)) return `<unresolvable caret: ${JSON.stringify(position.path)}>`;
  const marked: FormulaNode[] = updateArray(state.content, arrayPathOf(position.path), (array) =>
    array.map((current, index) => (index === target.index ? text(`${node.value.slice(0, position.offset)}|${node.value.slice(position.offset)}`) : current)));
  return serializeToLatex(marked);
}

export const latexOf = (state: RowState): string => serializeToLatex(state.content);

// ---------------------------------------------------------------------------
// A deterministic corpus
// ---------------------------------------------------------------------------

/**
 * Deterministic corpus generator — a failure reproduces exactly from its seed.
 *
 * Shared rather than owned by one suite, and **registry-driven**: it builds constructs by
 * asking the table what slots they have, so a row added to the registry starts appearing in
 * every property test that draws from here without the generator being touched. A generator
 * with the kinds written into it would quietly keep testing only the old ones, which is the
 * failure this whole milestone is meant to make impossible.
 */
export function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export type Random = () => number;
const SAFE_CHARACTERS = "0123456789xyab+-=.,⋅";
export const pick = <Item,>(random: Random, items: readonly Item[]): Item => items[Math.floor(random() * items.length)];
const randomText = (random: Random): string => Array.from({ length: Math.floor(random() * 4) }, () => pick(random, [...SAFE_CHARACTERS])).join("");

export const CONSTRUCT_KINDS = Object.keys(CONSTRUCTS) as ConstructKind[];

/** One construct of the given kind, with every slot filled and optional ones half the time. */
export function randomConstruct(random: Random, kind: ConstructKind, depth: number): CompoundNode {
  const filled: Partial<Record<BranchKey, FormulaNode[]>> = {};
  for (const slot of specOf(kind).slots) {
    // Both arities of an optional slot get exercised: a plain root and a root with an index.
    if (slot.optional && random() < 0.5) continue;
    filled[slot.key] = randomArray(random, depth);
  }
  return buildConstruct(kind, filled);
}

export function randomArray(random: Random, depth: number): FormulaNode[] {
  const nodes: FormulaNode[] = [text(randomText(random))];
  const count = depth <= 0 ? 0 : Math.floor(random() * 3);
  for (let index = 0; index < count; index += 1) nodes.push(randomConstruct(random, pick(random, CONSTRUCT_KINDS), depth - 1), text(randomText(random)));
  return nodes;
}

/** Trees that certainly contain the given kind, which is what a per-row property needs. */
export const corpusOf = (kind: ConstructKind, count = 40, seed = 20260813): FormulaNode[][] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => normalize([text(randomText(random)), randomConstruct(random, kind, 2), text(randomText(random))]));
};

/** Every node kind appearing anywhere in a tree. */
export function kindsIn(nodes: FormulaNode[]): Set<string> {
  const found = new Set<string>();
  const walk = (array: FormulaNode[]) => {
    for (const node of array) {
      found.add(node.type);
      for (const branch of branchesOf(node)) walk(branch.nodes);
    }
  };
  walk(nodes);
  return found;
}

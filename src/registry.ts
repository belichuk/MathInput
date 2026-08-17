import type { BranchKey, CompoundNode, FormulaNode, NodeKind } from "./model";

/**
 * What each construct is, declared once.
 *
 * Knowledge about "what a fraction is" used to be spread across seven files: the slot table
 * in `model.ts`, the insertion policy in `reducers.ts`, a CSS-modifier map and a height model
 * in `render.tsx`, a template in `serialize.ts`, six arms in `parse.ts`, and two tables in the
 * shell. Adding a construct meant editing all of them, and any one of them could be forgotten
 * — which is how two independent implementations of the adoption rule came to exist. It is one
 * table now, and the layers read it.
 *
 * **Types only, from `model.ts`.** That is deliberate: `model.ts` reads this table, so a
 * runtime import in this direction would be a cycle. Everything a row needs that would
 * otherwise come from the model arrives as an argument instead — `lines` is handed the height
 * function, `write` is handed the serializer — which also makes every row a pure function of
 * its inputs and testable as one.
 *
 * ## What is not here: reading LaTeX
 *
 * A row declares how its construct is *written* and not how it is *read*. `parse.ts` is still
 * six hand-written arms, and this is a known limit rather than an oversight.
 *
 * Writing is a template over slots that are already known. Reading is not the inverse of that
 * in any way a table can express as it stands: `\sqrt[i]{r}` has an optional argument that
 * changes the construct's arity, `\left(…\right)` is a pair of stretchy delimiters either of
 * which may be absent from malformed input, and `^`/`_` adopt their base *backwards out of the
 * token stream already consumed* rather than reading it forwards. A declarative form covering
 * all three without collapsing back into a switch is a design question that has not been
 * answered, so it is not guessed at here.
 *
 * The cost of the limit, stated plainly: **adding a row below gives a construct its slots, its
 * caret behaviour, its height, its styling and its LaTeX output, but not its LaTeX input.** A
 * new construct still needs an arm added to `parse.ts` by hand, and `read ∘ write = id` is
 * therefore a property the tests check rather than one the table guarantees. Four of the five
 * layers are table-driven, which is worth having on its own.
 */

/** Every kind but a run: the things that have slots. */
export type ConstructKind = Exclude<NodeKind, "text">;
type NodeOf<K extends ConstructKind> = Extract<CompoundNode, { type: K }>;
/**
 * The slot names that kind actually has, read off the node type itself. This is what decision
 * D-2 buys: `caret: "base"` in the fraction row below is a compile error rather than a caret
 * that silently goes nowhere, and a generic `Record<string, Sequence>` would have thrown it
 * away.
 */
type BranchOf<K extends ConstructKind> = Extract<keyof NodeOf<K>, BranchKey>;

type SlotSpec<K extends ConstructKind> = {
  key: BranchOf<K>;
  /** The CSS modifier the stylesheet writes against, and what an address may later shorten to. */
  code: string;
  /** A slot that can be absent altogether rather than merely empty: a plain root has no index. */
  optional?: true;
};

export type ConstructSpec<K extends ConstructKind> = {
  kind: K;
  /** Visual, left-to-right order. This *is* the order caret navigation walks them in. */
  slots: readonly SlotSpec<K>[];
  /** Where a term written in front of the construct goes when the construct adopts one. */
  adopted: BranchOf<K>;
  /** Slot pairs from top to bottom, which is what ↑ and ↓ will move between (M4). */
  vertical?: readonly (readonly [BranchOf<K>, BranchOf<K>])[];
  /** How many lines of writing this stands, given the heights of its slots. Never measured. */
  lines: (node: NodeOf<K>, linesIn: (nodes: FormulaNode[]) => number) => number;
  /** The LaTeX it is written as. There is no `read`; see the note above. */
  write: (node: NodeOf<K>, latex: (nodes: FormulaNode[]) => string) => string;
  /** A character that steps the caret out of it from inside, rather than being written. */
  closedBy?: string;
};

/**
 * The same row seen by code that does not know which kind it has.
 *
 * Two types rather than one, because they are wanted for opposite reasons. `ConstructSpec<K>`
 * is for *writing* a row: it knows that a fraction's slots are the numerator and the
 * denominator and rejects anything else, which is the whole point of keeping the typed union.
 * `AnySpec` is for *reading* one in a layer holding a node whose kind is a runtime fact —
 * there, per-kind precision is not merely unavailable but actively wrong, since `keyof` across
 * a union yields only the keys they share.
 */
export type AnySpec = {
  kind: ConstructKind;
  slots: readonly { key: BranchKey; code: string; optional?: true }[];
  adopted: BranchKey;
  vertical?: readonly (readonly [BranchKey, BranchKey])[];
  lines: (node: CompoundNode, linesIn: (nodes: FormulaNode[]) => number) => number;
  write: (node: CompoundNode, latex: (nodes: FormulaNode[]) => string) => string;
  closedBy?: string;
};

/** Keeps each row checked against its own kind instead of against the union of all of them. */
const construct = <K extends ConstructKind>(spec: ConstructSpec<K>): ConstructSpec<K> => spec;

export const CONSTRUCTS = {
  sqrt: construct({
    kind: "sqrt",
    // The index comes first because it is drawn first, and it is optional because
    // `index === null` is a square root rather than a root with an empty index.
    slots: [{ key: "index", code: "root-index", optional: true }, { key: "content", code: "radicand" }],
    adopted: "content",
    lines: (node, linesIn) => linesIn(node.content) + 0.35,
    write: (node, latex) => (node.index === null ? `\\sqrt{${latex(node.content)}}` : `\\sqrt[${latex(node.index)}]{${latex(node.content)}}`),
  }),
  frac: construct({
    kind: "frac",
    slots: [{ key: "numerator", code: "numerator" }, { key: "denominator", code: "denominator" }],
    adopted: "numerator",
    vertical: [["numerator", "denominator"]],
    lines: (node, linesIn) => linesIn(node.numerator) + linesIn(node.denominator),
    write: (node, latex) => `\\frac{${latex(node.numerator)}}{${latex(node.denominator)}}`,
  }),
  power: construct({
    kind: "power",
    slots: [{ key: "base", code: "base" }, { key: "exponent", code: "exponent" }],
    adopted: "base",
    vertical: [["exponent", "base"]],
    // A script rides part of a line above its base rather than a whole one.
    lines: (node, linesIn) => linesIn(node.base) + 0.4 * linesIn(node.exponent),
    write: (node, latex) => `${latex(node.base)}^{${latex(node.exponent)}}`,
  }),
  subscript: construct({
    kind: "subscript",
    slots: [{ key: "base", code: "base" }, { key: "subscript", code: "subscript" }],
    adopted: "base",
    vertical: [["base", "subscript"]],
    lines: (node, linesIn) => linesIn(node.base) + 0.4 * linesIn(node.subscript),
    write: (node, latex) => `${latex(node.base)}_{${latex(node.subscript)}}`,
  }),
  group: construct({
    kind: "group",
    slots: [{ key: "content", code: "group" }],
    adopted: "content",
    lines: (node, linesIn) => linesIn(node.content),
    write: (node, latex) => `\\left(${latex(node.content)}\\right)`,
    // `)` typed inside brackets leaves them rather than adding a stray one.
    closedBy: ")",
  }),
} satisfies { [K in ConstructKind]: ConstructSpec<K> };

/**
 * The table, read for a kind that is only known at runtime.
 *
 * TypeScript cannot see that `CONSTRUCTS[kind]` is the row belonging to *that* kind, so the
 * correlation is asserted here — in these two lines, and nowhere else in the codebase. It holds
 * by construction: the table is keyed by kind, every row names its own, and `satisfies` above
 * checks that the two agree.
 */
export const specOf = (kind: ConstructKind): AnySpec => CONSTRUCTS[kind] as unknown as AnySpec;
export const specFor = (node: CompoundNode): AnySpec => specOf(node.type);

/** The stylesheet's name for a slot. */
export const slotCodeOf = (kind: ConstructKind, branch: BranchKey): string =>
  specOf(kind).slots.find((slot) => slot.key === branch)?.code ?? "";

// ---------------------------------------------------------------------------

/**
 * What a trigger opens, which is not settled by the construct alone.
 *
 * The same fraction behaves differently depending on how it was asked for: `/` turns the term
 * in front of the caret into a numerator and waits in the denominator, while the toolbar's
 * fraction button takes nothing and waits in the numerator. So the policy belongs to the
 * trigger and the slot a captured term lands in belongs to the construct — `adopted` above.
 *
 * `caretWithoutTerm` is the fallback when there was nothing to capture: `/` on an empty row
 * opens a fraction to be filled in from the top instead of leaving the caret under a numerator
 * nothing can be written into.
 */
export type InsertKind = "sqrt" | "cubeRoot" | "frac" | "power" | "subscript" | "group";

export type Insertion<K extends ConstructKind> = {
  kind: K;
  /** Slots the construct is born holding, written as their literal text. */
  writes?: Partial<Record<BranchOf<K>, string>>;
  /** Whether it takes the term written in front of the caret. */
  adopts: boolean;
  caret: BranchOf<K>;
  caretWithoutTerm?: BranchOf<K>;
};

/** The loose reading of it, for the reducer, which handles whichever trigger fired. */
export type AnyInsertion = {
  kind: ConstructKind;
  writes?: Partial<Record<BranchKey, string>>;
  adopts: boolean;
  caret: BranchKey;
  caretWithoutTerm?: BranchKey;
};

const insertion = <K extends ConstructKind>(spec: Insertion<K>): Insertion<K> => spec;

/**
 * The toolbar's buttons. A tool opens a formula at the first slot that still has to be
 * written, and takes nothing with it — except the scripts, which behave as their keys do.
 */
export const TOOL_INSERTIONS = {
  sqrt: insertion({ kind: "sqrt", adopts: false, caret: "content" }),
  // A root of a written index, with the index already written. The general `\sqrt[n]{…}` is
  // still read and kept; it is just not what this button inserts.
  cubeRoot: insertion({ kind: "sqrt", adopts: false, caret: "content", writes: { index: "3" } }),
  frac: insertion({ kind: "frac", adopts: false, caret: "numerator" }),
  // Pressed with a term behind it a power takes that term as its base and the exponent is
  // what is left; pressed with nothing behind it there is no base yet, and no key writes one
  // from inside the exponent, so that is where the caret waits.
  power: insertion({ kind: "power", adopts: true, caret: "exponent", caretWithoutTerm: "base" }),
  subscript: insertion({ kind: "subscript", adopts: true, caret: "subscript", caretWithoutTerm: "base" }),
  group: insertion({ kind: "group", adopts: false, caret: "content" }),
} satisfies Record<InsertKind, AnyInsertion>;

/** The keys that build something, each of which adopts what is written in front of it. */
export const KEY_INSERTIONS = {
  divide: insertion({ kind: "frac", adopts: true, caret: "denominator", caretWithoutTerm: "numerator" }),
  power: insertion({ kind: "power", adopts: true, caret: "exponent" }),
  subscript: insertion({ kind: "subscript", adopts: true, caret: "subscript" }),
} satisfies Record<string, AnyInsertion>;

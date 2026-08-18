import {
  type BranchKey, type CaretPosition, type CompoundNode, type FormulaNode, type Path, type SelectionRange,
  arrayPathOf, branchesOf, branchKeys, branchOf, buildConstruct, collapsedAt, emptyContent, enclosingNodePath, isCollapsed, isCompound, isShallowEmpty, isText,
  isBlank, LEADING_TERM, nextBoundary, normalize, orderedRange, previousBoundary, resolve, resolveArray, resolveNode, samePath, slotPath, stepOf, text, textAt, TIMES, TRAILING_TERM, updateArray, withBranch,
} from "./model";
import { type AnyInsertion, type InsertKind, KEY_INSERTIONS, TOOL_INSERTIONS, specFor, specOf } from "./registry";
import { cleanFormulaText, parseLatex } from "./parse";
import { endOfArray, exitBackward, exitForward, nextPosition, positionAfterNode, previousPosition, rowEnd, rowStart, skipForward, startOfArray } from "./caret";

/**
 * Every editing operation, as a pure function of (row, caret) → (row, caret).
 *
 * Nothing here touches the DOM or React; the component's job is to turn events into
 * actions and render whatever comes back.
 */

export type RowState = { content: FormulaNode[]; selection: SelectionRange };
/** The insertable kinds, which are the registry's triggers: `cubeRoot` builds a `sqrt`. */
export type CompoundKind = InsertKind;

export type Action =
  | { type: "insertText"; text: string }
  /** Pasted text, read as a formula when it is one and written literally when it is not. */
  | { type: "paste"; text: string }
  /** Toolbar insertion. Powers and subscripts adopt the preceding term, as typing `^`/`_` does. */
  | { type: "insertCompound"; kind: CompoundKind }
  /** The `/` key: turn the preceding term into a numerator. */
  | { type: "divide" }
  | { type: "script"; kind: "power" | "subscript" }
  /** `=` comes out to the row first, so it always separates whole formulas. */
  | { type: "equals" }
  /** `)` leaves the brackets it is typed in, rather than adding a stray one. */
  | { type: "closeGroup" }
  | { type: "delete"; direction: "backward" | "forward" }
  | { type: "move"; direction: "backward" | "forward" }
  /** The space bar: forward past what is in front of the caret rather than into it. */
  | { type: "skip" }
  | { type: "moveToEdge"; edge: "start" | "end" }
  | { type: "select"; selection: SelectionRange };

export const createRowState = (line: string): RowState => ({ content: parseLatex(line), selection: collapsedAt(rowStart()) });
const settle = (content: FormulaNode[], caret: CaretPosition): RowState => ({ content, selection: collapsedAt(caret) });
/** Moves the caret and nothing else; a movement with nowhere to go leaves the state alone. */
const moveTo = (state: RowState, caret: CaretPosition | null): RowState => (caret ? { content: state.content, selection: collapsedAt(caret) } : state);
const replaceNode = (array: FormulaNode[], index: number, node: FormulaNode): FormulaNode[] => array.map((current, at) => (at === index ? node : current));
const valueOf = (node: FormulaNode | undefined): string => (isText(node) ? node.value : "");

// ---------------------------------------------------------------------------
// Range deletion
// ---------------------------------------------------------------------------

/** Everything after `position` in this array goes; the node holding it is kept and truncated. */
function clearAfter(nodes: FormulaNode[], position: CaretPosition): FormulaNode[] {
  const step = position.path[0];
  const node = step ? nodes[step.index] : undefined;
  if (!step || !node) return nodes;
  if (step.branch === undefined) return [...nodes.slice(0, step.index), text(valueOf(node).slice(0, position.offset))];
  if (!isCompound(node)) return nodes;
  const keys = branchKeys(node);
  const at = keys.indexOf(step.branch);
  if (at < 0) return nodes;
  let updated: CompoundNode = withBranch(node, step.branch, clearAfter(branchOf(node, step.branch)!, { path: position.path.slice(1), offset: position.offset }));
  for (let later = at + 1; later < keys.length; later += 1) updated = withBranch(updated, keys[later], emptyContent());
  return [...nodes.slice(0, step.index), updated, text()];
}

/** Mirror of clearAfter: everything before `position` goes. */
function clearBefore(nodes: FormulaNode[], position: CaretPosition): FormulaNode[] {
  const step = position.path[0];
  const node = step ? nodes[step.index] : undefined;
  if (!step || !node) return nodes;
  if (step.branch === undefined) return [text(valueOf(node).slice(position.offset)), ...nodes.slice(step.index + 1)];
  if (!isCompound(node)) return nodes;
  const keys = branchKeys(node);
  const at = keys.indexOf(step.branch);
  if (at < 0) return nodes;
  let updated: CompoundNode = withBranch(node, step.branch, clearBefore(branchOf(node, step.branch)!, { path: position.path.slice(1), offset: position.offset }));
  for (let earlier = 0; earlier < at; earlier += 1) updated = withBranch(updated, keys[earlier], emptyContent());
  return [text(), updated, ...nodes.slice(step.index + 1)];
}

/**
 * Deletes everything between two positions, wherever they sit in the tree.
 *
 * A formula spanned only in part keeps its structure and loses the covered part of each
 * slot — half a fraction is not a thing, so the fraction survives with emptied slots.
 * The caret afterwards is `start`, whose path stays valid by construction.
 */
export function deleteRange(nodes: FormulaNode[], start: CaretPosition, end: CaretPosition): FormulaNode[] {
  const first = start.path[0];
  const last = end.path[0];
  if (!first || !last) return nodes;
  if (first.index === last.index && first.branch !== undefined && last.branch !== undefined) {
    const node = nodes[first.index];
    if (!isCompound(node)) return nodes;
    const descend = (position: CaretPosition): CaretPosition => ({ path: position.path.slice(1), offset: position.offset });
    if (first.branch === last.branch) {
      const branch = branchOf(node, first.branch);
      return branch ? replaceNode(nodes, first.index, withBranch(node, first.branch, deleteRange(branch, descend(start), descend(end)))) : nodes;
    }
    const keys = branchKeys(node);
    const from = keys.indexOf(first.branch);
    const to = keys.indexOf(last.branch);
    if (from < 0 || to < 0 || from > to) return nodes;
    let updated: CompoundNode = withBranch(node, first.branch, clearAfter(branchOf(node, first.branch)!, descend(start)));
    for (let between = from + 1; between < to; between += 1) updated = withBranch(updated, keys[between], emptyContent());
    updated = withBranch(updated, last.branch, clearBefore(branchOf(node, last.branch)!, descend(end)));
    return replaceNode(nodes, first.index, updated);
  }
  return normalize([...clearAfter(nodes, start), ...clearBefore(nodes, end)]);
}

/** Resolves a selection to a caret, deleting the selected range first if there is one. */
function takeSelection(state: RowState): { content: FormulaNode[]; caret: CaretPosition } {
  if (isCollapsed(state.selection)) return { content: state.content, caret: state.selection.focus };
  const { start, end } = orderedRange(state.content, state.selection);
  return { content: deleteRange(state.content, start, end), caret: start };
}

/** Removes a whole node and merges the text runs that were on either side of it. */
function removeNodeAt(content: FormulaNode[], nodePath: Path): { content: FormulaNode[]; caret: CaretPosition } {
  const arrayPath = arrayPathOf(nodePath);
  const index = stepOf(nodePath).index;
  const array = resolveArray(content, arrayPath) ?? [];
  const before = valueOf(array[index - 1]);
  return {
    content: updateArray(content, arrayPath, (nodes) => [...nodes.slice(0, index - 1), text(before + valueOf(nodes[index + 1])), ...nodes.slice(index + 2)]),
    caret: { path: [...arrayPath, { index: index - 1 }], offset: before.length },
  };
}

// ---------------------------------------------------------------------------
// Insertion
// ---------------------------------------------------------------------------

/** `replace` is how many characters immediately behind the caret the insertion is written over. */
function insertTextAt(content: FormulaNode[], caret: CaretPosition, value: string, replace = 0): RowState {
  const target = resolve(content, caret.path);
  const node = target?.array[target.index];
  if (!target || !isText(node)) return settle(content, caret);
  const at = caret.offset - replace;
  const next = node.value.slice(0, at) + value + node.value.slice(caret.offset);
  return settle(updateArray(content, arrayPathOf(caret.path), (array) => replaceNode(array, target.index, text(next))), { path: caret.path, offset: at + value.length });
}

/** The signs written as characters rather than built as formulas. */
const SIGNS = `+-:${TIMES}`;
const isSign = (value: string): boolean => value.length === 1 && SIGNS.includes(value);

/**
 * Whether a sign being typed takes the place of the one behind it.
 *
 * Two signs in a row are a slip rather than a formula — nobody means `1+-` — and the
 * second one is nearly always the correction, so it is written over the first: `1+` then
 * `−` is `1−`, from the key or from the toolbar alike. Only a sign replaces a sign;
 * anything with a digit, a bracket or a whole formula behind it is written as it is, and
 * so a minus opening a row or a bracket is still a minus sign.
 */
function replacesSign(content: FormulaNode[], caret: CaretPosition, value: string): boolean {
  if (!isSign(value)) return false;
  const node = textAt(content, caret.path);
  return node !== null && caret.offset > 0 && isSign(node.value[caret.offset - 1]);
}

/**
 * What may be written against a formula with nothing between it and the formula.
 *
 * `LEADING_TERM` — which is what the rest of this file means by a term — includes `.` and `,`,
 * and neither belongs here. A comma after a fraction is a list (`\frac{1}{2}, \frac{1}{3}`) and
 * a full stop is very often the end of a sentence; writing `\frac{1}{2}\cdot ,` for either would
 * turn punctuation into arithmetic. A letter or a digit has no such second reading.
 */
const OPENS_A_TERM = /^[A-Za-z0-9]/;

/**
 * Whether what is being typed needs the multiplication sign nobody typed.
 *
 * `\frac{1}{3}x` is a fraction times x, and so are `\sqrt{2}10` and `x^{2}10` — juxtaposition
 * is multiplication, and it is written that way on paper. But a value read by something other
 * than a person has to be *told*: a marking script comparing answers, or anything evaluating
 * one, would otherwise have to guess where a term ended and the next began, and guessing is
 * exactly what an editor exists to make unnecessary. So the sign is written, and what leaves the
 * field says what it means.
 *
 * The condition is entirely local, and it is the junction rather than the keystroke: a letter or
 * a digit written at the very start of a run whose left-hand neighbour is a construct. Depth
 * makes no difference — the numerator of a fraction is an array like any other — and neither
 * does how the character arrived, so pasting `10` after a root reads the same as typing it.
 *
 * **Only this direction.** Text written *before* a construct is left alone, and not for want of
 * symmetry: `2` then a fraction is how somebody writes two and a half, and `2\cdot\frac{1}{2}`
 * is not what they meant. Which of the two readings a host wants is a real question — mixed
 * numbers are a serialisation decision this release does not take — and the answer to it should
 * not be pre-empted by a rule about spacing.
 */
function juxtaposesConstruct(content: FormulaNode[], caret: CaretPosition, value: string): boolean {
  if (caret.offset !== 0 || !OPENS_A_TERM.test(value)) return false;
  const target = resolve(content, caret.path);
  return target !== null && isText(target.array[target.index]) && isCompound(target.array[target.index - 1]);
}

type Capture = { array: FormulaNode[]; index: number; offset: number; term: FormulaNode[] };

function takePrecedingTerm(array: FormulaNode[], index: number, offset: number): Capture {
  const value = valueOf(array[index]);
  const match = TRAILING_TERM.exec(value.slice(0, offset))?.[0];
  if (match) {
    const start = offset - match.length;
    return { array: replaceNode(array, index, text(value.slice(0, start) + value.slice(offset))), index, offset: start, term: [text(match)] };
  }
  const preceding = array[index - 1];
  if (offset === 0 && isCompound(preceding)) {
    const before = valueOf(array[index - 2]);
    return { array: [...array.slice(0, index - 2), text(before + value), ...array.slice(index + 1)], index: index - 2, offset: before.length, term: normalize([preceding]) };
  }
  return { array, index, offset, term: emptyContent() };
}

/** The mirror of `takePrecedingTerm`: the term the caret sits in front of, taken out to be wrapped. */
function takeFollowingTerm(array: FormulaNode[], index: number, offset: number): Capture {
  const value = valueOf(array[index]);
  const match = LEADING_TERM.exec(value.slice(offset))?.[0];
  if (match) {
    return { array: replaceNode(array, index, text(value.slice(0, offset) + value.slice(offset + match.length))), index, offset, term: [text(match)] };
  }
  const following = array[index + 1];
  if (offset === value.length && isCompound(following)) {
    const after = valueOf(array[index + 2]);
    return { array: [...array.slice(0, index), text(value + after), ...array.slice(index + 3)], index, offset, term: normalize([following]) };
  }
  return { array, index, offset, term: emptyContent() };
}

/**
 * The construct a trigger opens, built from its registry row: the adopted term goes into the
 * slot that construct adopts into, whatever the trigger was, and anything the row says is
 * written already is written.
 */
const buildNode = (insertion: AnyInsertion, term: FormulaNode[]): CompoundNode => {
  const written: Partial<Record<BranchKey, FormulaNode[]>> = {};
  for (const [branch, value] of Object.entries(insertion.writes ?? {})) written[branch as BranchKey] = [text(value as string)];
  if (insertion.adopts && !isBlank(term)) written[specOf(insertion.kind).adopted] = term;
  return buildConstruct(insertion.kind, written);
};

/**
 * Splices a formula read from pasted text into the run the caret sits in.
 *
 * The caret ends after what was pasted rather than before it, which is where a paste leaves it
 * everywhere else. Working out where that is takes no searching: every compound pasted brings
 * the run that follows it, so the run the caret ends in sits two places further along per
 * compound, and the caret sits as far into it as the pasted text's own trailing run is long —
 * that run and whatever the caret was in front of having merged into one.
 */
function insertNodesAt(content: FormulaNode[], caret: CaretPosition, nodes: FormulaNode[]): RowState {
  const target = resolve(content, caret.path);
  if (!target || !isText(target.array[target.index])) return { content, selection: collapsedAt(caret) };
  const value = valueOf(target.array[target.index]);
  const array = normalize([
    ...target.array.slice(0, target.index),
    text(value.slice(0, caret.offset)),
    ...nodes,
    text(value.slice(caret.offset)),
    ...target.array.slice(target.index + 1),
  ]);
  const arrayPath = arrayPathOf(caret.path);
  const tail = nodes[nodes.length - 1];
  return {
    content: updateArray(content, arrayPath, () => array),
    selection: collapsedAt({
      path: [...arrayPath, { index: target.index + 2 * nodes.filter(isCompound).length }],
      offset: isText(tail) ? tail.value.length : 0,
    }),
  };
}

/**
 * A selection, taken out whole so a construct can be written around it.
 *
 * Only when it lies inside one array, which is the case worth having: `x+1` selected in a row
 * and `/` pressed. A selection running from inside a fraction to somewhere outside it has no
 * single thing to wrap — half a fraction is not a term — and those are replaced as they always
 * were rather than guessed at.
 */
function selectedTerm(state: RowState): { caret: CaretPosition; capture: Capture } | null {
  const { start, end } = orderedRange(state.content, state.selection);
  const arrayPath = arrayPathOf(start.path);
  if (!samePath(arrayPath, arrayPathOf(end.path))) return null;
  const array = resolveArray(state.content, arrayPath);
  const from = stepOf(start.path).index;
  const to = stepOf(end.path).index;
  if (!array || !isText(array[from]) || !isText(array[to])) return null;
  const head = valueOf(array[from]);
  const tail = valueOf(array[to]);
  const term = from === to
    ? [text(head.slice(start.offset, end.offset))]
    : normalize([text(head.slice(start.offset)), ...array.slice(from + 1, to), text(tail.slice(0, end.offset))]);
  if (isBlank(term)) return null;
  return {
    caret: { path: [...arrayPath, { index: from }], offset: start.offset },
    capture: {
      array: [...array.slice(0, from), text(head.slice(0, start.offset) + tail.slice(end.offset)), ...array.slice(to + 1)],
      index: from,
      offset: start.offset,
      term,
    },
  };
}

/** `caretWithoutTerm` is where the caret goes when there was no term to capture: `/` with nothing in front of it opens an empty fraction to fill in from the top. */
function insertCompound(state: RowState, insertion: AnyInsertion): RowState {
  // What is selected is what the construct is written around, whether or not the trigger would
  // have adopted anything on its own: selecting `x+1` and pressing `/` makes it the numerator.
  const wrapping = isCollapsed(state.selection) ? null : selectedTerm(state);
  const { content, caret } = wrapping ? { content: state.content, caret: wrapping.caret } : takeSelection(state);
  const target = resolve(content, caret.path);
  if (!target || !isText(target.array[target.index])) return state;
  const captured = wrapping?.capture ?? (insertion.adopts
    ? takePrecedingTerm(target.array, target.index, caret.offset)
    : { array: target.array, index: target.index, offset: caret.offset, term: emptyContent() });
  const node = buildNode({ ...insertion, adopts: wrapping ? true : insertion.adopts }, captured.term);
  // Around a selection the caret goes to the first slot still waiting to be written, which is
  // what a tool does anyway; otherwise the trigger's row says where.
  const caretBranch: BranchKey = wrapping
    ? branchesOf(node).find((branch) => isBlank(branch.nodes))?.key ?? insertion.caret
    : isBlank(captured.term) ? insertion.caretWithoutTerm ?? insertion.caret : insertion.caret;
  // The slot the caret is about to land in takes whatever is written directly in front of
  // it, so brackets, a root or a fraction opened before a term wrap that term rather than
  // pushing it aside — and the caret waits at the end of it, still inside the new slot. A
  // construct written around a selection takes nothing further: the selection said what.
  const wrapped = wrapping
    ? { array: captured.array, index: captured.index, offset: captured.offset, term: emptyContent() }
    : takeFollowingTerm(captured.array, captured.index, captured.offset);
  const value = valueOf(wrapped.array[wrapped.index]);
  const arrayPath = arrayPathOf(caret.path);
  const array = [
    ...wrapped.array.slice(0, wrapped.index),
    text(value.slice(0, wrapped.offset)),
    isBlank(wrapped.term) ? node : withBranch(node, caretBranch, wrapped.term),
    text(value.slice(wrapped.offset)),
    ...wrapped.array.slice(wrapped.index + 1),
  ];
  const nodePath: Path = [...arrayPath, { index: wrapped.index + 1 }];
  const next = updateArray(content, arrayPath, () => array);
  const slot = slotPath(nodePath, caretBranch);
  // At the start of a slot that is empty, at the end of one that is not.
  return { content: next, selection: collapsedAt(isBlank(resolveArray(next, slot) ?? []) ? startOfArray(slot) : endOfArray(next, slot)) };
}

/**
 * Where a relation belongs, which is not always where it was typed.
 *
 * `=` separates whole statements, so typed inside something that cannot hold one it comes out
 * of it — a numerator, a radicand, an exponent. It stops at the first construct that *can*
 * hold one, so `=` typed between brackets stays between them, and at the row when nothing can.
 * Which constructs can is declared per construct rather than being a list kept here.
 */
function relationPosition(content: FormulaNode[], caret: CaretPosition): CaretPosition {
  let position = caret;
  for (let guard = 0; guard < 64; guard += 1) {
    const nodePath = enclosingNodePath(position.path);
    const node = nodePath ? resolveNode(content, nodePath) : null;
    if (!nodePath || !isCompound(node) || specFor(node).relationContainer) return position;
    position = positionAfterNode(nodePath);
  }
  return position;
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/**
 * Backspace or Delete at the edge of a slot.
 *
 * An enclosing formula that is empty across every one of its slots is removed as one
 * object — shallowly, so a slot holding an empty formula still counts as occupied and
 * only one thing is ever removed per keypress. Otherwise the caret steps out of the slot
 * rather than destroying content the user can still see.
 */
function escapeSlot(state: RowState, direction: "backward" | "forward"): RowState {
  const { path } = state.selection.focus;
  const nodePath = enclosingNodePath(path);
  if (!nodePath) return state;
  const node = resolveNode(state.content, nodePath);
  if (!isCompound(node)) return state;
  if (isShallowEmpty(node)) {
    const { content, caret } = removeNodeAt(state.content, nodePath);
    return settle(content, caret);
  }
  const target = direction === "backward" ? exitBackward(state.content, path) : exitForward(state.content, path);
  return target ? { content: state.content, selection: collapsedAt(target) } : state;
}

function deleteAt(state: RowState, direction: "backward" | "forward"): RowState {
  if (!isCollapsed(state.selection)) {
    const { content, caret } = takeSelection(state);
    return settle(content, caret);
  }
  const caret = state.selection.focus;
  const target = resolve(state.content, caret.path);
  const node = target?.array[target.index];
  if (!target || !isText(node)) return state;

  const backward = direction === "backward";
  const from = backward ? previousBoundary(node.value, caret.offset) : caret.offset;
  const to = backward ? caret.offset : nextBoundary(node.value, caret.offset);
  if (backward ? caret.offset > 0 : caret.offset < node.value.length) {
    const value = node.value.slice(0, from) + node.value.slice(to);
    return settle(updateArray(state.content, arrayPathOf(caret.path), (array) => replaceNode(array, target.index, text(value))), { path: caret.path, offset: from });
  }

  // The run is exhausted in this direction; the neighbour is a formula, which goes as one object.
  const neighbour = backward ? target.index - 1 : target.index + 1;
  if (isCompound(target.array[neighbour])) {
    const { content, caret: next } = removeNodeAt(state.content, [...arrayPathOf(caret.path), { index: neighbour }]);
    return settle(content, next);
  }
  return escapeSlot(state, direction);
}

// ---------------------------------------------------------------------------

export function reduce(state: RowState, action: Action): RowState {
  switch (action.type) {
    case "insertText": {
      const value = cleanFormulaText(action.text);
      if (!value) return state;
      const { content, caret } = takeSelection(state);
      const written = juxtaposesConstruct(content, caret, value) ? TIMES + value : value;
      return insertTextAt(content, caret, written, replacesSign(content, caret, value) ? 1 : 0);
    }
    // Which slot each of these opens at, and whether it adopts the term in front of it, is
    // the registry's business rather than this file's.
    /**
     * `parse.ts` exists for exactly this: a tolerant reader that takes whatever it is given.
     * Pasted LaTeX arrives as the formula it describes rather than as its own source code —
     * `\\frac{1}{2}` becomes a fraction the caret can be moved around inside. Text with no
     * structure in it is ordinary typing and goes the ordinary way, sign-correction and all.
     */
    case "paste": {
      const parsed = parseLatex(action.text);
      if (!parsed.some(isCompound)) return reduce(state, { type: "insertText", text: action.text });
      const { content, caret } = takeSelection(state);
      return insertNodesAt(content, caret, parsed);
    }
    case "insertCompound": return insertCompound(state, TOOL_INSERTIONS[action.kind]);
    case "divide": return insertCompound(state, KEY_INSERTIONS.divide);
    case "script": return insertCompound(state, KEY_INSERTIONS[action.kind]);
    case "equals": {
      const collapsed = isCollapsed(state.selection);
      const { content, caret } = takeSelection(state);
      return insertTextAt(content, collapsed ? relationPosition(content, caret) : caret, "=");
    }
    case "closeGroup": {
      // The last reducer that named a construct. It asks the registry which construct this
      // character closes instead, so `|` closing an absolute value is a row rather than a
      // second arm here.
      const nodePath = isCollapsed(state.selection) ? enclosingNodePath(state.selection.focus.path) : null;
      const node = nodePath ? resolveNode(state.content, nodePath) : null;
      const closes = isCompound(node) && specFor(node).closedBy === ")";
      if (nodePath && closes) return { content: state.content, selection: collapsedAt({ path: [...arrayPathOf(nodePath), { index: stepOf(nodePath).index + 1 }], offset: 0 }) };
      const { content, caret } = takeSelection(state);
      return insertTextAt(content, caret, ")");
    }
    case "delete": return deleteAt(state, action.direction);
    case "move": {
      if (!isCollapsed(state.selection)) {
        const { start, end } = orderedRange(state.content, state.selection);
        return moveTo(state, action.direction === "backward" ? start : end);
      }
      return moveTo(state, action.direction === "backward" ? previousPosition(state.content, state.selection.focus) : nextPosition(state.content, state.selection.focus));
    }
    // A selection is stepped out of rather than over: the space bar puts the caret at its
    // far end, the same as `→`, leaving what was selected written and behind the caret.
    case "skip": return isCollapsed(state.selection)
      ? moveTo(state, skipForward(state.content, state.selection.focus))
      : moveTo(state, orderedRange(state.content, state.selection).end);
    case "moveToEdge": return { content: state.content, selection: collapsedAt(action.edge === "start" ? rowStart() : rowEnd(state.content)) };
    case "select": return { content: state.content, selection: action.selection };
  }
}

import {
  type BranchKey, type CaretPosition, type CompoundNode, type FormulaNode, type Path, type SelectionRange,
  arrayPathOf, branchKeys, branchOf, collapsedAt, emptyContent, enclosingNodePath, frac, group, isCollapsed, isCompound, isShallowEmpty, isText,
  isBlank, nextBoundary, normalize, orderedRange, power, previousBoundary, resolve, resolveArray, resolveNode, slotPath, sqrt, stepOf, subscript, text, updateArray, withBranch,
} from "./model";
import { cleanFormulaText, parseLatex } from "./parse";
import { exitBackward, exitForward, nextPosition, previousPosition, rowEnd, rowStart, startOfArray } from "./caret";

/**
 * Every editing operation, as a pure function of (row, caret) → (row, caret).
 *
 * Nothing here touches the DOM or React; the component's job is to turn events into
 * actions and render whatever comes back.
 */

export type RowState = { content: FormulaNode[]; selection: SelectionRange };
export type CompoundKind = "sqrt" | "nthRoot" | "frac" | "power" | "subscript" | "group";

export type Action =
  | { type: "insertText"; text: string }
  /** Toolbar insertion. Powers and subscripts adopt the preceding term, as typing `^`/`_` does. */
  | { type: "insertCompound"; kind: CompoundKind }
  /** The `/` key: turn the preceding term into a numerator. */
  | { type: "divide" }
  | { type: "script"; kind: "power" | "subscript" }
  /** `=` steps out of the innermost formula first, so `10^=2` cannot be typed. */
  | { type: "equals" }
  | { type: "delete"; direction: "backward" | "forward" }
  | { type: "move"; direction: "backward" | "forward" }
  | { type: "moveToEdge"; edge: "start" | "end" }
  | { type: "select"; selection: SelectionRange };

export const createRowState = (line: string): RowState => ({ content: parseLatex(line), selection: collapsedAt(rowStart()) });
const settle = (content: FormulaNode[], caret: CaretPosition): RowState => ({ content, selection: collapsedAt(caret) });
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

function insertTextAt(content: FormulaNode[], caret: CaretPosition, value: string): RowState {
  const target = resolve(content, caret.path);
  const node = target?.array[target.index];
  if (!target || !isText(node)) return settle(content, caret);
  const next = node.value.slice(0, caret.offset) + value + node.value.slice(caret.offset);
  return settle(updateArray(content, arrayPathOf(caret.path), (array) => replaceNode(array, target.index, text(next))), { path: caret.path, offset: caret.offset + value.length });
}

/** What `/`, `^` and `_` swallow: the run of term characters behind the caret, or the whole formula behind it. */
const TRAILING_TERM = /[A-Za-z0-9.,]+$/;
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

const buildNode = (kind: CompoundKind, term: FormulaNode[]): CompoundNode => {
  switch (kind) {
    case "sqrt": return sqrt();
    case "nthRoot": return sqrt(emptyContent(), emptyContent());
    case "frac": return frac(term, emptyContent());
    case "power": return power(term, emptyContent());
    case "subscript": return subscript(term, emptyContent());
    case "group": return group();
  }
};

/** `emptyCaretBranch` is where the caret goes when there was no term to capture: `/` with nothing in front of it opens an empty fraction to fill in from the top. */
function insertCompound(state: RowState, kind: CompoundKind, options: { capture: boolean; caretBranch: BranchKey; emptyCaretBranch?: BranchKey }): RowState {
  const { content, caret } = takeSelection(state);
  const target = resolve(content, caret.path);
  if (!target || !isText(target.array[target.index])) return state;
  const captured = options.capture
    ? takePrecedingTerm(target.array, target.index, caret.offset)
    : { array: target.array, index: target.index, offset: caret.offset, term: emptyContent() };
  const caretBranch = isBlank(captured.term) ? options.emptyCaretBranch ?? options.caretBranch : options.caretBranch;
  const value = valueOf(captured.array[captured.index]);
  const arrayPath = arrayPathOf(caret.path);
  const array = [
    ...captured.array.slice(0, captured.index),
    text(value.slice(0, captured.offset)),
    buildNode(kind, captured.term),
    text(value.slice(captured.offset)),
    ...captured.array.slice(captured.index + 1),
  ];
  const nodePath: Path = [...arrayPath, { index: captured.index + 1 }];
  return { content: updateArray(content, arrayPath, () => array), selection: collapsedAt(startOfArray(slotPath(nodePath, caretBranch))) };
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
      return insertTextAt(content, caret, value);
    }
    case "insertCompound": {
      const script = action.kind === "power" || action.kind === "subscript";
      const caretBranch: BranchKey = action.kind === "power" ? "exponent" : action.kind === "subscript" ? "subscript" : action.kind === "frac" ? "numerator" : action.kind === "nthRoot" ? "index" : "content";
      return insertCompound(state, action.kind, { capture: script, caretBranch });
    }
    case "divide": return insertCompound(state, "frac", { capture: true, caretBranch: "denominator", emptyCaretBranch: "numerator" });
    case "script": return insertCompound(state, action.kind, { capture: true, caretBranch: action.kind === "power" ? "exponent" : "subscript" });
    case "equals": {
      const nodePath = isCollapsed(state.selection) ? enclosingNodePath(state.selection.focus.path) : null;
      if (nodePath) return insertTextAt(state.content, { path: [...arrayPathOf(nodePath), { index: stepOf(nodePath).index + 1 }], offset: 0 }, "=");
      const { content, caret } = takeSelection(state);
      return insertTextAt(content, caret, "=");
    }
    case "delete": return deleteAt(state, action.direction);
    case "move": {
      if (!isCollapsed(state.selection)) {
        const { start, end } = orderedRange(state.content, state.selection);
        return { content: state.content, selection: collapsedAt(action.direction === "backward" ? start : end) };
      }
      const target = action.direction === "backward" ? previousPosition(state.content, state.selection.focus) : nextPosition(state.content, state.selection.focus);
      return target ? { content: state.content, selection: collapsedAt(target) } : state;
    }
    case "moveToEdge": return { content: state.content, selection: collapsedAt(action.edge === "start" ? rowStart() : rowEnd(state.content)) };
    case "select": return { content: state.content, selection: action.selection };
  }
}

import {
  type CaretPosition, type FormulaNode, type Path,
  arrayPathOf, branchKeys, enclosingNodePath, isCompound, isText, nextBoundary, previousBoundary, resolve, resolveArray, resolveNode, slotPath, stepOf,
} from "./model";

/**
 * Caret movement over the tree.
 *
 * Every caret position sits inside a text run; compound nodes are entered rather than
 * landed on. Because the alternation invariant guarantees a text run at both ends of every
 * array and between every pair of compounds, "at the start" and "at the end" are index
 * comparisons — no DOM boundary points are compared anywhere, which is the whole point.
 */

export const startOfArray = (arrayPath: Path): CaretPosition => ({ path: [...arrayPath, { index: 0 }], offset: 0 });

export function endOfArray(root: FormulaNode[], arrayPath: Path): CaretPosition {
  const array = resolveArray(root, arrayPath) ?? [];
  const index = Math.max(array.length - 1, 0);
  const node = array[index];
  return { path: [...arrayPath, { index }], offset: isText(node) ? node.value.length : 0 };
}

export const rowStart = (): CaretPosition => startOfArray([]);
export const rowEnd = (root: FormulaNode[]): CaretPosition => endOfArray(root, []);

/** Steps into a compound node's first or last slot. */
export function enterNode(root: FormulaNode[], nodePath: Path, side: "first" | "last"): CaretPosition | null {
  const node = resolveNode(root, nodePath);
  if (!isCompound(node)) return null;
  const keys = branchKeys(node);
  const key = side === "first" ? keys[0] : keys[keys.length - 1];
  if (!key) return null;
  const path = slotPath(nodePath, key);
  return side === "first" ? startOfArray(path) : endOfArray(root, path);
}

/** The text run just after a node — guaranteed to exist by the alternation invariant. */
export const positionAfterNode = (nodePath: Path): CaretPosition => ({ path: [...arrayPathOf(nodePath), { index: stepOf(nodePath).index + 1 }], offset: 0 });

export function positionBeforeNode(root: FormulaNode[], nodePath: Path): CaretPosition {
  const arrayPath = arrayPathOf(nodePath);
  const index = stepOf(nodePath).index - 1;
  const node = (resolveArray(root, arrayPath) ?? [])[index];
  return { path: [...arrayPath, { index }], offset: isText(node) ? node.value.length : 0 };
}

/**
 * Leaves the enclosing node: its next slot if it has one, otherwise the run after it.
 * `landing` picks which end of that next slot the caret takes — an arrow steps to its
 * start, the space bar to its end.
 */
export function exitForward(root: FormulaNode[], path: Path, landing: "start" | "end" = "start"): CaretPosition | null {
  const nodePath = enclosingNodePath(path);
  if (!nodePath) return null;
  const node = resolveNode(root, nodePath);
  if (!isCompound(node)) return null;
  const keys = branchKeys(node);
  const at = keys.indexOf(path[path.length - 2].branch!);
  if (at >= 0 && at < keys.length - 1) {
    const slot = slotPath(nodePath, keys[at + 1]);
    return landing === "start" ? startOfArray(slot) : endOfArray(root, slot);
  }
  return positionAfterNode(nodePath);
}

export function exitBackward(root: FormulaNode[], path: Path): CaretPosition | null {
  const nodePath = enclosingNodePath(path);
  if (!nodePath) return null;
  const node = resolveNode(root, nodePath);
  if (!isCompound(node)) return null;
  const keys = branchKeys(node);
  const at = keys.indexOf(path[path.length - 2].branch!);
  if (at > 0) return endOfArray(root, slotPath(nodePath, keys[at - 1]));
  return positionBeforeNode(root, nodePath);
}

/** The next caret position in reading order, or null at the end of the row. */
export function nextPosition(root: FormulaNode[], position: CaretPosition): CaretPosition | null {
  const target = resolve(root, position.path);
  if (!target) return null;
  const node = target.array[target.index];
  if (isText(node) && position.offset < node.value.length) return { path: position.path, offset: nextBoundary(node.value, position.offset) };
  const following = target.array[target.index + 1];
  if (isCompound(following)) return enterNode(root, [...arrayPathOf(position.path), { index: target.index + 1 }], "first");
  return exitForward(root, position.path);
}

/** The previous caret position in reading order, or null at the start of the row. */
export function previousPosition(root: FormulaNode[], position: CaretPosition): CaretPosition | null {
  const target = resolve(root, position.path);
  if (!target) return null;
  const node = target.array[target.index];
  if (isText(node) && position.offset > 0) return { path: position.path, offset: previousBoundary(node.value, position.offset) };
  const preceding = target.array[target.index - 1];
  if (isCompound(preceding)) return enterNode(root, [...arrayPathOf(position.path), { index: target.index - 1 }], "last");
  return exitBackward(root, position.path);
}

/**
 * The space bar: one step forward *past* whatever is in front of the caret, never into it.
 *
 * That is the rest of the text run being written, then over a whole formula standing next
 * to it, then out of the slot itself. A slot left this way hands the caret to the *end* of
 * the next one, because what is written there is written and the place to carry on is
 * after it: `\frac{1|}{2}` goes to `\frac{1}{2|}`, and the press after that leaves the
 * fraction. Null at the end of the row, where there is nothing left to step past.
 */
export function skipForward(root: FormulaNode[], position: CaretPosition): CaretPosition | null {
  const target = resolve(root, position.path);
  if (!target) return null;
  const node = target.array[target.index];
  if (isText(node) && position.offset < node.value.length) return { path: position.path, offset: node.value.length };
  if (isCompound(target.array[target.index + 1])) return positionAfterNode([...arrayPathOf(position.path), { index: target.index + 1 }]);
  return exitForward(root, position.path, "end");
}

/** Clamps a position onto a real text run — used when a native gesture leaves the caret somewhere odd. */
export function clampPosition(root: FormulaNode[], position: CaretPosition): CaretPosition {
  const target = resolve(root, position.path);
  const node = target?.array[target.index];
  if (!target || !isText(node)) return rowStart();
  return { path: position.path, offset: Math.max(0, Math.min(position.offset, node.value.length)) };
}

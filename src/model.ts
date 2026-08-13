/**
 * The formula document model: types, the array invariant, and path arithmetic.
 *
 * Pure data — no DOM, no LaTeX, no React. Everything that interprets the shape of a
 * `Path` lives here so that reducers, rendering, and selection sync all agree on it.
 */

export type TextNode = { type: "text"; value: string };
/** `index` is `null` for a plain square root, an array for `\sqrt[n]{…}`. */
export type SqrtNode = { type: "sqrt"; index: FormulaNode[] | null; content: FormulaNode[] };
export type FracNode = { type: "frac"; numerator: FormulaNode[]; denominator: FormulaNode[] };
/** Powers own their base, so `10^{2}` is a single object rather than text beside a superscript. */
export type PowerNode = { type: "power"; base: FormulaNode[]; exponent: FormulaNode[] };
export type SubscriptNode = { type: "subscript"; base: FormulaNode[]; subscript: FormulaNode[] };
export type GroupNode = { type: "group"; content: FormulaNode[] };
export type CompoundNode = SqrtNode | FracNode | PowerNode | SubscriptNode | GroupNode;
export type FormulaNode = TextNode | CompoundNode;
export type NodeKind = FormulaNode["type"];
export type Row = { id: string; content: FormulaNode[] };

export type BranchKey = "content" | "index" | "numerator" | "denominator" | "base" | "exponent" | "subscript";
export type Branch = { key: BranchKey; nodes: FormulaNode[] };
/** `branch` names the array of the compound node at `index` to descend into; the last step of a path has none. */
export type PathStep = { index: number; branch?: BranchKey };
export type Path = PathStep[];
export type CaretPosition = { path: Path; offset: number };
export type SelectionRange = { anchor: CaretPosition; focus: CaretPosition };

/** Multiplication as it is stored and shown: a dot, `\cdot`, never a cross. */
export const TIMES = "⋅";

export const text = (value = ""): TextNode => ({ type: "text", value });
export const emptyContent = (): FormulaNode[] => [text()];
export const sqrt = (content = emptyContent(), index: FormulaNode[] | null = null): SqrtNode => ({ type: "sqrt", index, content });
export const frac = (numerator = emptyContent(), denominator = emptyContent()): FracNode => ({ type: "frac", numerator, denominator });
export const power = (base = emptyContent(), exponent = emptyContent()): PowerNode => ({ type: "power", base, exponent });
export const subscript = (base = emptyContent(), sub = emptyContent()): SubscriptNode => ({ type: "subscript", base, subscript: sub });
export const group = (content = emptyContent()): GroupNode => ({ type: "group", content });

export const isText = (node: FormulaNode | null | undefined): node is TextNode => node?.type === "text";
export const isCompound = (node: FormulaNode | null | undefined): node is CompoundNode => node !== null && node !== undefined && node.type !== "text";

/**
 * Branches in visual left-to-right order — the order arrow navigation walks them.
 * Never rely on object key order anywhere else; ask this function.
 */
export function branchesOf(node: FormulaNode): Branch[] {
  switch (node.type) {
    case "text": return [];
    case "sqrt": return node.index === null ? [{ key: "content", nodes: node.content }] : [{ key: "index", nodes: node.index }, { key: "content", nodes: node.content }];
    case "frac": return [{ key: "numerator", nodes: node.numerator }, { key: "denominator", nodes: node.denominator }];
    case "power": return [{ key: "base", nodes: node.base }, { key: "exponent", nodes: node.exponent }];
    case "subscript": return [{ key: "base", nodes: node.base }, { key: "subscript", nodes: node.subscript }];
    case "group": return [{ key: "content", nodes: node.content }];
  }
}

export const branchOf = (node: FormulaNode, key: BranchKey): FormulaNode[] | null => branchesOf(node).find((branch) => branch.key === key)?.nodes ?? null;
export const branchKeys = (node: FormulaNode): BranchKey[] => branchesOf(node).map((branch) => branch.key);
export const withBranch = <Node extends CompoundNode>(node: Node, key: BranchKey, nodes: FormulaNode[]): Node => ({ ...node, [key]: nodes });

/** An array holding nothing but a single empty text run — the "empty slot" case. */
export const isBlank = (nodes: FormulaNode[]): boolean => nodes.length === 1 && isText(nodes[0]) && nodes[0].value === "";
/** Shallow, deliberately: a branch holding an *empty* compound still counts as occupied. */
export const isShallowEmpty = (node: FormulaNode): boolean => isCompound(node) && branchesOf(node).every((branch) => isBlank(branch.nodes));

/**
 * The one invariant every `FormulaNode[]` obeys: strict alternation, with a (possibly
 * empty) text run at both ends and between every pair of compound nodes, and never two
 * adjacent text runs. That guarantees a caret always has exactly one text run to sit in
 * on either side of any formula, which is what replaces the old invisible anchor
 * character. Deep — normalizes every branch too.
 */
export function normalize(nodes: FormulaNode[]): FormulaNode[] {
  const result: FormulaNode[] = [];
  let pending = "";
  for (const node of nodes) {
    if (isText(node)) { pending += node.value; continue; }
    result.push(text(pending));
    pending = "";
    result.push(branchesOf(node).reduce<CompoundNode>((current, branch) => withBranch(current, branch.key, normalize(branch.nodes)), node));
  }
  result.push(text(pending));
  return result;
}

export function isNormalized(nodes: FormulaNode[]): boolean {
  if (nodes.length % 2 === 0) return false;
  return nodes.every((node, index) => {
    if (index % 2 === 0) return isText(node);
    return isCompound(node) && branchesOf(node).every((branch) => isNormalized(branch.nodes));
  });
}

/** Resolves a caret path to the array that holds the targeted node and its index within it. */
export function resolve(root: FormulaNode[], path: Path): { array: FormulaNode[]; index: number } | null {
  const array = resolveArray(root, path.slice(0, -1));
  const last = path[path.length - 1];
  if (!array || !last) return null;
  return last.index >= 0 && last.index < array.length ? { array, index: last.index } : null;
}

/** Resolves a path whose every step carries a branch (i.e. one that names an array rather than a node). */
export function resolveArray(root: FormulaNode[], arrayPath: Path): FormulaNode[] | null {
  let array: FormulaNode[] = root;
  for (const step of arrayPath) {
    const node = array[step.index];
    const nodes = node && step.branch ? branchOf(node, step.branch) : null;
    if (!nodes) return null;
    array = nodes;
  }
  return array;
}

export const resolveNode = (root: FormulaNode[], path: Path): FormulaNode | null => {
  const target = resolve(root, path);
  return target ? target.array[target.index] ?? null : null;
};

export const textAt = (root: FormulaNode[], path: Path): TextNode | null => {
  const node = resolveNode(root, path);
  return isText(node) ? node : null;
};

/** Immutably replaces the array named by `arrayPath`, rebuilding only the spine above it. */
export function updateArray(root: FormulaNode[], arrayPath: Path, update: (nodes: FormulaNode[]) => FormulaNode[]): FormulaNode[] {
  const [step, ...rest] = arrayPath;
  if (!step) return update(root);
  const node = root[step.index];
  if (!isCompound(node) || !step.branch) return root;
  const branch = branchOf(node, step.branch);
  if (!branch) return root;
  return root.map((current, index) => (index === step.index ? withBranch(node, step.branch!, updateArray(branch, rest, update)) : current));
}

/** The path of the array holding the node a path points at. */
export const arrayPathOf = (path: Path): Path => path.slice(0, -1);
export const stepOf = (path: Path): PathStep => path[path.length - 1] ?? { index: 0 };
export const positionIn = (arrayPath: Path, index: number, offset: number): CaretPosition => ({ path: [...arrayPath, { index }], offset });
/** A node's path with `branch` appended to its last step: the address of one of its slots. */
export const slotPath = (nodePath: Path, branch: BranchKey): Path => [...nodePath.slice(0, -1), { ...stepOf(nodePath), branch }];
/** The compound node directly enclosing a position, or null when the position is at the top level. */
export const enclosingNodePath = (path: Path): Path | null => (path.length < 2 ? null : [...path.slice(0, -2), { index: path[path.length - 2].index }]);

/** Document order. Needs the tree because branch ordering is per node type. */
export function comparePaths(root: FormulaNode[], first: Path, second: Path): number {
  let array: FormulaNode[] = root;
  for (let depth = 0; depth < Math.min(first.length, second.length); depth += 1) {
    const left = first[depth];
    const right = second[depth];
    if (left.index !== right.index) return left.index - right.index;
    const node = array[left.index];
    if (left.branch !== right.branch) {
      const keys = node ? branchKeys(node) : [];
      return keys.indexOf(left.branch as BranchKey) - keys.indexOf(right.branch as BranchKey);
    }
    const next = node && left.branch ? branchOf(node, left.branch) : null;
    if (!next) break;
    array = next;
  }
  return first.length - second.length;
}

export const comparePositions = (root: FormulaNode[], first: CaretPosition, second: CaretPosition): number => comparePaths(root, first.path, second.path) || first.offset - second.offset;
export const samePath = (first: Path, second: Path): boolean => first.length === second.length && first.every((step, index) => step.index === second[index].index && step.branch === second[index].branch);
export const samePosition = (first: CaretPosition, second: CaretPosition): boolean => first.offset === second.offset && samePath(first.path, second.path);
export const isCollapsed = (selection: SelectionRange): boolean => samePosition(selection.anchor, selection.focus);
export const collapsedAt = (position: CaretPosition): SelectionRange => ({ anchor: position, focus: position });
/** Anchor/focus in the order the user dragged them; this returns them in document order. */
export const orderedRange = (root: FormulaNode[], selection: SelectionRange): { start: CaretPosition; end: CaretPosition } =>
  comparePositions(root, selection.anchor, selection.focus) <= 0 ? { start: selection.anchor, end: selection.focus } : { start: selection.focus, end: selection.anchor };

/** Caret offsets move by whole code points so surrogate pairs are never split. */
export const previousBoundary = (value: string, offset: number): number => (offset > 1 && value.charCodeAt(offset - 1) >= 0xdc00 && value.charCodeAt(offset - 1) <= 0xdfff ? offset - 2 : offset - 1);
export const nextBoundary = (value: string, offset: number): number => offset + ((value.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1);

export const encodePath = (path: Path): string => path.map((step) => (step.branch ? `${step.index}.${step.branch}` : `${step.index}`)).join("/");
export function decodePath(value: string): Path {
  if (!value) return [];
  return value.split("/").map((part) => {
    const [index, branch] = part.split(".");
    return branch ? { index: Number(index), branch: branch as BranchKey } : { index: Number(index) };
  });
}

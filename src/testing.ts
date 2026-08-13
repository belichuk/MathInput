/** Test-only helpers. Not part of the component's runtime. */
import { type BranchKey, type CaretPosition, type FormulaNode, type Path, type SelectionRange, arrayPathOf, collapsedAt, isText, resolve, text, updateArray } from "./model";
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

import { type CaretPosition, type FormulaNode, type Path, type SelectionRange, decodePath, encodePath, textAt } from "./model";
import { CARET_PLACEHOLDER } from "./render";

/**
 * The only place that touches Range and Selection.
 *
 * Positions are written to the DOM and read back from it through the `data-path`
 * attributes the renderer emits. Crucially, nothing here *compares* DOM positions to
 * decide editing behaviour — that was the source of the boundary-point bugs. Reads are
 * only ever a translation back into a model position, which the model then owns.
 */

type DomPoint = { node: Node; offset: number };

const TEXT_RUN = ".math-input__text";
const isTextRun = (element: Element | null | undefined): element is HTMLElement => element instanceof HTMLElement && element.classList.contains("math-input__text");
/** A blank run renders one zero-width placeholder, which is not part of the model's text. */
const runLength = (span: HTMLElement): number => (span.dataset.blank === undefined ? span.textContent?.length ?? 0 : 0);
const elementFor = (field: HTMLElement, path: Path): HTMLElement | null => field.querySelector<HTMLElement>(`[data-path="${encodePath(path)}"]`);

function domPointFor(field: HTMLElement, position: CaretPosition): DomPoint | null {
  const element = elementFor(field, position.path);
  if (!element) return null;
  const run = element.firstChild;
  if (!run || run.nodeType !== Node.TEXT_NODE) return { node: element, offset: 0 };
  if (element.dataset.blank !== undefined) return { node: run, offset: 0 };
  return { node: run, offset: Math.max(0, Math.min(position.offset, run.textContent?.length ?? 0)) };
}

/** Writes a model selection to the document. Returns whether anything actually moved. */
export function applySelection(field: HTMLElement, selection: SelectionRange): boolean {
  const anchor = domPointFor(field, selection.anchor);
  const focus = domPointFor(field, selection.focus);
  const current = window.getSelection();
  if (!anchor || !focus || !current) return false;
  if (current.anchorNode === anchor.node && current.anchorOffset === anchor.offset && current.focusNode === focus.node && current.focusOffset === focus.offset) return false;
  current.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  return true;
}

/** Reads a DOM position back as a model position, snapping to the nearest text run. */
export function positionFromDom(field: HTMLElement, node: Node | null, offset: number): CaretPosition | null {
  if (!node || !(node === field || field.contains(node))) return null;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const owner = element?.closest<HTMLElement>("[data-path]");
  if (isTextRun(owner)) return { path: decodePath(owner.dataset.path!), offset: Math.min(offset, runLength(owner)) };

  // Landed on a slot, a formula or the field itself: take the run on whichever side the offset names.
  const container = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const children = container ? [...container.childNodes] : [];
  const before = children[offset - 1];
  const after = children[offset];
  const trailing = before instanceof Element ? lastRunIn(before) : null;
  const leading = after instanceof Element ? firstRunIn(after) : null;
  if (leading) return { path: decodePath(leading.dataset.path!), offset: 0 };
  if (trailing) return { path: decodePath(trailing.dataset.path!), offset: runLength(trailing) };
  const fallback = owner ? firstRunIn(owner) : firstRunIn(field);
  return fallback ? { path: decodePath(fallback.dataset.path!), offset: 0 } : null;
}

const firstRunIn = (element: Element): HTMLElement | null => (isTextRun(element) ? element : element.querySelector<HTMLElement>(TEXT_RUN));
const lastRunIn = (element: Element): HTMLElement | null => {
  if (isTextRun(element)) return element;
  const runs = element.querySelectorAll<HTMLElement>(TEXT_RUN);
  return runs[runs.length - 1] ?? null;
};

export const selectionFromDom = (field: HTMLElement): SelectionRange | null => {
  const current = window.getSelection();
  if (!current || current.rangeCount === 0) return null;
  const anchor = positionFromDom(field, current.anchorNode, current.anchorOffset);
  const focus = positionFromDom(field, current.focusNode, current.focusOffset);
  return anchor && focus ? { anchor, focus } : null;
};

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/** Pointer hit-testing: the browser's own caret placement, then a geometric fallback for clicks off any text. */
export function positionFromPoint(field: HTMLElement, x: number, y: number): CaretPosition | null {
  const owner = field.ownerDocument as CaretDocument;
  const range = owner.caretRangeFromPoint?.(x, y);
  const hit = range ? { node: range.startContainer, offset: range.startOffset } : owner.caretPositionFromPoint?.(x, y);
  const point = hit && "offsetNode" in hit ? { node: hit.offsetNode, offset: hit.offset } : (hit as { node: Node; offset: number } | null | undefined);
  if (point && field.contains(point.node)) {
    const position = positionFromDom(field, point.node, point.offset);
    if (position) return beyondFormula(field, position, x) ?? position;
  }
  return nearestPosition(field, x, y);
}

/**
 * A click past the edge of a formula means "carry on after it", not "go into its last
 * slot" — which is where the browser's own hit-testing lands, since a formula's slots
 * reach to its edge. Walks out to the outermost formula the click fell outside of.
 */
function beyondFormula(field: HTMLElement, position: CaretPosition, x: number): CaretPosition | null {
  let escaped: { path: Path; after: boolean } | null = null;
  let element = elementFor(field, position.path)?.parentElement ?? null;
  for (; element && element !== field; element = element.parentElement) {
    if (element.dataset.math === undefined) continue;
    const rect = element.getBoundingClientRect();
    if (x <= rect.right && x >= rect.left) continue;
    const path = decodePath(element.dataset.path!);
    const after = x > rect.right;
    escaped = { path: [...path.slice(0, -1), { index: path[path.length - 1].index + (after ? 1 : -1) }], after };
  }
  if (!escaped) return null;
  const run = elementFor(field, escaped.path);
  // Leaving a formula forwards lands at the start of the run after it, backwards at the end of the run before it.
  return run ? { path: escaped.path, offset: escaped.after ? 0 : runLength(run) } : null;
}

function nearestPosition(field: HTMLElement, x: number, y: number): CaretPosition | null {
  let best: { span: HTMLElement; atEnd: boolean } | null = null;
  let shortest = Number.POSITIVE_INFINITY;
  for (const span of field.querySelectorAll<HTMLElement>(TEXT_RUN)) {
    const rect = span.getBoundingClientRect();
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (distance < shortest) {
      shortest = distance;
      best = { span, atEnd: x > rect.left + rect.width / 2 };
    }
  }
  if (!best) return null;
  return { path: decodePath(best.span.dataset.path!), offset: best.atEnd ? runLength(best.span) : 0 };
}

/**
 * A preventDefault'd, programmatically placed caret does not get the browser's free
 * "scroll the caret into view" that a real input event would, so the field does it itself.
 */
export function scrollCaretIntoView(field: HTMLElement): void {
  const current = window.getSelection();
  if (!current?.rangeCount) return;
  const caret = current.getRangeAt(0).getBoundingClientRect();
  if (caret.height === 0 && caret.width === 0) return;
  const bounds = field.getBoundingClientRect();
  const rightMargin = 56; // clears the new-row button and the field's fade-out mask
  const leftMargin = 16;
  if (caret.right > bounds.right - rightMargin) field.scrollLeft += caret.right - bounds.right + rightMargin;
  else if (caret.left < bounds.left + leftMargin) field.scrollLeft -= bounds.left + leftMargin - caret.left;
}

/**
 * Rewrites every text run from the tree.
 *
 * Composition is the one time the DOM is allowed to diverge from state, and React's view
 * of the DOM goes stale while it does. Putting the model's text back before dispatching
 * means React's next render diffs against what is really on screen.
 */
export function repairField(field: HTMLElement, content: FormulaNode[]): void {
  for (const span of field.querySelectorAll<HTMLElement>(TEXT_RUN)) {
    const node = textAt(content, decodePath(span.dataset.path!));
    const expected = node === null ? "" : node.value === "" ? CARET_PLACEHOLDER : node.value;
    if (span.textContent !== expected) span.textContent = expected;
  }
}

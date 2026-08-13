/**
 * Undo/redo over whole editor snapshots.
 *
 * Cheap because the document is an immutable tree: a snapshot shares every unchanged
 * subtree with its neighbours. Consecutive edits carrying the same tag collapse into one
 * step, so a typed word undoes as a word rather than a letter at a time.
 */

type Entry<Snapshot> = { snapshot: Snapshot; tag: string };
export type History<Snapshot> = { past: Entry<Snapshot>[]; future: Entry<Snapshot>[]; lastTag: string };

const LIMIT = 200;

export const emptyHistory = <Snapshot,>(): History<Snapshot> => ({ past: [], future: [], lastTag: "" });

/** Call with the state *before* an edit. An empty tag never coalesces. */
export function record<Snapshot>(history: History<Snapshot>, snapshot: Snapshot, tag = ""): History<Snapshot> {
  if (tag !== "" && tag === history.lastTag) return { ...history, future: [] };
  return { past: [...history.past, { snapshot, tag }].slice(-LIMIT), future: [], lastTag: tag };
}

export function undo<Snapshot>(history: History<Snapshot>, current: Snapshot): { history: History<Snapshot>; snapshot: Snapshot } | null {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, { snapshot: current, tag: "" }], lastTag: "" },
    snapshot: previous.snapshot,
  };
}

export function redo<Snapshot>(history: History<Snapshot>, current: Snapshot): { history: History<Snapshot>; snapshot: Snapshot } | null {
  const next = history.future[history.future.length - 1];
  if (!next) return null;
  return {
    history: { past: [...history.past, { snapshot: current, tag: "" }], future: history.future.slice(0, -1), lastTag: "" },
    snapshot: next.snapshot,
  };
}

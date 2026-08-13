import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import "./MathInput.css";
import { type FormulaNode, type SelectionRange, collapsedAt, isBlank, samePosition } from "./model";
import { rowEnd, rowStart } from "./caret";
import { type Action, type CompoundKind, type RowState, reduce } from "./reducers";
import { parseLatex } from "./parse";
import { serializeToLatex } from "./serialize";
import { renderNodes } from "./render";
import { applySelection, positionFromPoint, repairField, scrollCaretIntoView, selectionFromDom } from "./selection";
import { type History, emptyHistory, record, redo, undo } from "./history";

export type MathInputProps = {
  /** One LaTeX-compatible expression per line. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

type Row = { id: string; content: FormulaNode[] };
type Caret = { rowId: string; range: SelectionRange } | null;
type EditorState = { rows: Row[]; caret: Caret };
type EditorIconName = CompoundKind | "newLine" | "remove";

const NUMERAL = "M528 432C528 437 526 442 521 445C517 448 512 449 507 447L459 431C451 428 446 419 449 411C452 403 461 398 469 401L496 410V288H464C455 288 448 281 448 272C448 263 455 256 464 256H560C569 256 576 263 576 272C576 281 569 288 560 288H528V432Z";
const LETTER_X = "M80 384C71 384 64 377 64 368C64 359 71 352 80 352H119L221 192L119 32H80C71 32 64 25 64 16C64 7 71 0 80 0H128C134 0 139 3 142 7L240 162L339 7C341 3 347 0 352 0H400C409 0 416 7 416 16C416 25 409 32 400 32H361L259 192L361 352H400C409 352 416 359 416 368C416 377 409 384 400 384H352C347 384 341 381 339 377L240 222L142 377C139 381 134 384 128 384H80Z";
const RADICAL = "M352 384C345 384 339 379 337 372L223 -20C222 -27 216 -31 210 -32C203 -33 197 -29 194 -24L83 184C80 189 75 192 69 192H16C7 192 0 199 0 208C0 217 7 224 16 224H69C87 224 103 214 111 199L204 26L306 381C312 402 331 416 352 416H560C569 416 576 409 576 400C576 391 569 384 560 384H352Z";

function EditorIcon({ name }: { name: EditorIconName }) {
  const glyph = {
    sqrt: { width: 576, paths: [RADICAL] },
    // The same radical, with the index drawn where a root's index sits.
    nthRoot: { width: 576, paths: [RADICAL], index: true },
    frac: { width: 448, paths: ["M248 344C248 357 237 368 224 368C211 368 200 357 200 344C200 331 211 320 224 320C237 320 248 331 248 344ZM168 344C168 375 193 400 224 400C255 400 280 375 280 344C280 313 255 288 224 288C193 288 168 313 168 344ZM0 192C0 201 7 208 16 208H432C441 208 448 201 448 192C448 183 441 176 432 176H16C7 176 0 183 0 192ZM224 16C237 16 248 27 248 40C248 53 237 64 224 64C211 64 200 53 200 40C200 27 211 16 224 16ZM224 96C255 96 280 71 280 40C280 9 255 -16 224 -16C193 -16 168 9 168 40C168 71 193 96 224 96Z"] },
    // A power and a subscript are the same two glyphs, with the numeral high or low.
    power: { width: 576, paths: [LETTER_X, NUMERAL] },
    subscript: { width: 576, paths: [LETTER_X], lowered: NUMERAL },
    group: { width: 448, paths: [], brackets: true },
    newLine: { width: 512, paths: ["M480 368C480 377 487 384 496 384C505 384 512 377 512 368V272C512 219 469 176 416 176H55L171 59C178 53 178 43 171 37C165 30 155 30 149 37L5 181C2 184 0 188 0 192C0 196 2 200 5 203L149 347C155 353 165 353 171 347C178 341 178 331 171 325L55 208H416C451 208 480 237 480 272V368Z"] },
    remove: { width: 448, paths: ["M176 432C169 432 163 427 161 421L150 384H299L288 421C286 427 279 432 272 432H176ZM130 430C136 450 155 464 176 464H272C293 464 312 450 318 430L332 384H432C441 384 448 377 448 368C448 359 441 352 432 352H16C7 352 0 359 0 368C0 377 7 384 16 384H116L130 430ZM52 -5 29 304H61L84 -2C85 -19 99 -32 115 -32H333C349 -32 363 -19 364 -2L387 304H419L396 -5C394 -38 366 -64 333 -64H115C82 -64 54 -38 52 -5ZM157 227C163 233 173 233 179 227L224 183L269 227C275 233 285 233 291 227C298 221 298 211 291 205L247 160L291 115C298 109 298 99 291 93C285 86 275 86 269 93L224 137L179 93C173 86 163 86 157 93C151 99 151 109 157 115L201 160L157 205C151 211 151 221 157 227Z"] },
  }[name] as { width: number; paths: string[]; index?: boolean; lowered?: string; brackets?: boolean };

  return <svg className="math-input__icon" viewBox={`0 -64 ${glyph.width} 512`} fill="currentColor" aria-hidden="true">
    <g transform="translate(0 384) scale(1 -1)">
      {glyph.paths.map((path) => <path key={path} d={path} />)}
      {glyph.lowered ? <path d={glyph.lowered} transform="translate(0 -270)" /> : null}
    </g>
    {glyph.index ? <text x="24" y="112" fontSize="230" fontWeight="700" fill="currentColor">n</text> : null}
    {glyph.brackets ? <g stroke="currentColor" strokeWidth="34" strokeLinecap="round" fill="none">
      <path d="M170 0C60 100 60 288 170 384" />
      <path d="M278 0C388 100 388 288 278 384" />
    </g> : null}
  </svg>;
}

const TOOLS: { kind: CompoundKind; label: string; title: string }[] = [
  { kind: "sqrt", label: "Insert square root", title: "Square root" },
  { kind: "nthRoot", label: "Insert nth root", title: "Nth root" },
  { kind: "frac", label: "Insert fraction", title: "Divide" },
  { kind: "power", label: "Insert power", title: "Power" },
  { kind: "subscript", label: "Insert subscript", title: "Subscript" },
  { kind: "group", label: "Insert brackets", title: "Brackets" },
];

/** Single characters that mean something structural rather than literal. */
const KEYED_ACTION: Record<string, Action> = {
  "/": { type: "divide" },
  "÷": { type: "divide" },
  "^": { type: "script", kind: "power" },
  _: { type: "script", kind: "subscript" },
  "=": { type: "equals" },
  "(": { type: "insertCompound", kind: "group" },
  ")": { type: "closeGroup" },
};

const BACKWARD_DELETIONS = ["deleteContentBackward", "deleteWordBackward", "deleteSoftLineBackward", "deleteHardLineBackward", "deleteByCut", "deleteByDrag", "deleteContent"];
const FORWARD_DELETIONS = ["deleteContentForward", "deleteWordForward", "deleteSoftLineForward", "deleteHardLineForward"];

const latexOf = (rows: Row[]): string => rows.map((row) => serializeToLatex(row.content)).join("\n");
const toRows = (latex: string): Row[] => latex.split("\n").map((line) => ({ id: crypto.randomUUID(), content: parseLatex(line) }));
const sameRange = (first: SelectionRange, second: SelectionRange): boolean => samePosition(first.anchor, second.anchor) && samePosition(first.focus, second.focus);

/** A dependency-free, visual formula editor that emits LaTeX-compatible text. */
export function MathInput({ value, defaultValue = "", onChange, placeholder = "Write a formula…", disabled = false, className = "", style, "aria-label": ariaLabel = "Math editor" }: MathInputProps) {
  const [state, setState] = useState<EditorState>(() => ({ rows: toRows(value ?? defaultValue), caret: null }));
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const fields = useRef(new Map<string, HTMLDivElement>());
  const frame = useRef<HTMLDivElement | null>(null);
  /** Mirrors `state` so event handlers read the current tree without re-subscribing. */
  const live = useRef(state);
  const history = useRef<History<EditorState>>(emptyHistory());
  const composing = useRef(false);
  const pendingFocus = useRef<string | null>(null);
  const published = useRef<string | null>(null);
  const labelId = useId();
  if (published.current === null) published.current = latexOf(state.rows);

  const commit = useCallback((next: EditorState) => {
    live.current = next;
    setState(next);
  }, []);

  /**
   * The single path from an event to a new document: read the current row, run the pure
   * reducer, keep the result. Nothing else is allowed to change the tree or the caret.
   */
  const dispatch = useCallback((rowId: string, action: Action, tag = "") => {
    const current = live.current;
    const index = current.rows.findIndex((row) => row.id === rowId);
    if (index < 0) return;
    const row = current.rows[index];
    const before: RowState = { content: row.content, selection: current.caret?.rowId === rowId ? current.caret.range : collapsedAt(rowEnd(row.content)) };
    const after = reduce(before, action);
    const edited = after.content !== before.content;
    if (!edited && sameRange(after.selection, before.selection)) return;
    // Moving the caret ends a run of typing, so undo stops where the user stopped.
    history.current = edited ? record(history.current, current, tag) : { ...history.current, lastTag: "" };
    commit({
      rows: edited ? current.rows.map((candidate, at) => (at === index ? { ...candidate, content: after.content } : candidate)) : current.rows,
      caret: { rowId, range: after.selection },
    });
  }, [commit]);

  const restore = useCallback((direction: "undo" | "redo") => {
    const result = (direction === "undo" ? undo : redo)(history.current, live.current);
    if (!result) return;
    history.current = result.history;
    pendingFocus.current = result.snapshot.caret?.rowId ?? null;
    commit(result.snapshot);
  }, [commit]);

  const createRow = useCallback(() => {
    const current = live.current;
    const row: Row = { id: crypto.randomUUID(), content: parseLatex("") };
    history.current = record(history.current, current);
    pendingFocus.current = row.id;
    commit({ rows: [...current.rows, row], caret: { rowId: row.id, range: collapsedAt(rowStart()) } });
  }, [commit]);

  const removeRow = useCallback((id: string) => {
    const current = live.current;
    if (current.rows.length < 2) return;
    const index = current.rows.findIndex((row) => row.id === id);
    const rows = current.rows.filter((row) => row.id !== id);
    const next = rows[Math.min(index, rows.length - 1)];
    history.current = record(history.current, current);
    pendingFocus.current = next.id;
    commit({ rows, caret: { rowId: next.id, range: collapsedAt(rowEnd(next.content)) } });
  }, [commit]);

  // Adopt a new controlled value, unless it is the one we just emitted.
  useEffect(() => {
    if (value === undefined || value === published.current) return;
    published.current = value;
    commit({ rows: toRows(value), caret: null });
  }, [value, commit]);

  useEffect(() => {
    const next = latexOf(state.rows);
    if (next === published.current) return;
    published.current = next;
    onChange?.(next);
  }, [state.rows, onChange]);

  // Put the caret where the model says it is. Runs after every render, and is a no-op
  // when the DOM already agrees, so it doubles as a repair for stray native movement.
  useLayoutEffect(() => {
    const caret = state.caret;
    const field = caret ? fields.current.get(caret.rowId) : undefined;
    if (composing.current || !caret || !field || document.activeElement !== field) return;
    if (applySelection(field, caret.range)) scrollCaretIntoView(field);
  });

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    const field = id ? fields.current.get(id) : undefined;
    if (!id || !field) return;
    pendingFocus.current = null;
    field.focus();
    if (live.current.caret?.rowId === id) applySelection(field, live.current.caret.range);
  }, [state]);

  // Native listeners, delegated from the frame: beforeinput carries the inputType that
  // keydown cannot be trusted for on mobile, and composition needs the real events.
  useEffect(() => {
    const container = frame.current;
    if (!container) return;
    const fieldOf = (target: EventTarget | null): HTMLElement | null => {
      const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
      return element?.closest<HTMLElement>(".math-input__field") ?? null;
    };

    const onBeforeInput = (event: Event) => {
      const input = event as InputEvent;
      const field = fieldOf(input.target);
      const rowId = field?.dataset.row;
      if (!field || !rowId) return;
      if (input.inputType === "insertCompositionText") return; // let the IME own the DOM until it is done
      if (disabled) { input.preventDefault(); return; }
      input.preventDefault();
      const data = input.data ?? input.dataTransfer?.getData("text") ?? "";
      if (input.inputType === "historyUndo") return restore("undo");
      if (input.inputType === "historyRedo") return restore("redo");
      if (BACKWARD_DELETIONS.includes(input.inputType)) return dispatch(rowId, { type: "delete", direction: "backward" }, `delete:${rowId}`);
      if (FORWARD_DELETIONS.includes(input.inputType)) return dispatch(rowId, { type: "delete", direction: "forward" }, `delete:${rowId}`);
      if (input.inputType === "insertParagraph" || input.inputType === "insertLineBreak") return createRow();
      if (!input.inputType.startsWith("insert")) return;
      const keyed = data.length === 1 ? KEYED_ACTION[data] : undefined;
      dispatch(rowId, keyed ?? { type: "insertText", text: data }, keyed ? "" : `type:${rowId}`);
    };

    const onCompositionStart = () => { composing.current = true; };

    const onCompositionEnd = (event: Event) => {
      composing.current = false;
      const field = fieldOf(event.target);
      const rowId = field?.dataset.row;
      const row = live.current.rows.find((candidate) => candidate.id === rowId);
      if (!field || !rowId || !row) return;
      // Undo the IME's direct DOM edits so React's next render diffs against reality,
      // then apply the composed text as one ordinary insertion.
      repairField(field, row.content);
      const composed = (event as CompositionEvent).data ?? "";
      if (composed) dispatch(rowId, { type: "insertText", text: composed });
      else if (live.current.caret) applySelection(field, live.current.caret.range);
    };

    // Anything that reached the DOM without going through a reducer gets reverted.
    const onInput = (event: Event) => {
      if (composing.current) return;
      const field = fieldOf(event.target);
      const row = live.current.rows.find((candidate) => candidate.id === field?.dataset.row);
      if (!field || !row) return;
      repairField(field, row.content);
      if (live.current.caret?.rowId === row.id) applySelection(field, live.current.caret.range);
    };

    container.addEventListener("beforeinput", onBeforeInput);
    container.addEventListener("compositionstart", onCompositionStart);
    container.addEventListener("compositionend", onCompositionEnd);
    container.addEventListener("input", onInput);
    return () => {
      container.removeEventListener("beforeinput", onBeforeInput);
      container.removeEventListener("compositionstart", onCompositionStart);
      container.removeEventListener("compositionend", onCompositionEnd);
      container.removeEventListener("input", onInput);
    };
  }, [disabled, dispatch, createRow, restore]);

  // Native selection gestures — Shift+Arrow, double-click, Select All — are left to the
  // browser and read back here, rather than each being given its own reducer action.
  useEffect(() => {
    const onSelectionChange = () => {
      if (composing.current) return;
      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !field.classList.contains("math-input__field")) return;
      const rowId = field.dataset.row;
      if (!rowId || !fields.current.has(rowId)) return;
      const range = selectionFromDom(field);
      const caret = live.current.caret;
      if (!range || (caret?.rowId === rowId && sameRange(caret.range, range))) return;
      commit({ rows: live.current.rows, caret: { rowId, range } });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [commit]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, rowId: string) => {
    if (disabled) return;
    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      if (key === "z") { event.preventDefault(); restore(event.shiftKey ? "redo" : "undo"); }
      else if (key === "y") { event.preventDefault(); restore("redo"); }
      return; // every other shortcut, including Select All and Copy, stays native
    }
    if (event.shiftKey && event.key.startsWith("Arrow")) return; // native selection extension
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      dispatch(rowId, { type: "move", direction: event.key === "ArrowLeft" ? "backward" : "forward" });
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      dispatch(rowId, { type: "moveToEdge", edge: event.key === "Home" ? "start" : "end" });
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      createRow();
    }
  };

  const buttonClass = "math-input__tool";
  return <div className={`math-input ${className}`.trim()} style={style}>
    <div className="math-input__frame" ref={frame} aria-labelledby={labelId}>
      <span id={labelId} className="math-input__visually-hidden">{ariaLabel}</span>
      {state.rows.map((row, index) => <div className="math-input__row" key={row.id}>
        {activeRowId === row.id && <div className="math-input__toolbar" role="toolbar" aria-label={`Formula tools for row ${index + 1}`}>
          {TOOLS.map((tool) => <button key={tool.kind} type="button" className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => dispatch(row.id, { type: "insertCompound", kind: tool.kind })} disabled={disabled} aria-label={tool.label} title={tool.title}><EditorIcon name={tool.kind} /></button>)}
          {state.rows.length > 1 && <button type="button" className="math-input__remove-row" onMouseDown={(event) => event.preventDefault()} onClick={() => removeRow(row.id)} aria-label="Remove formula row" title="Remove"><EditorIcon name="remove" /></button>}
        </div>}
        <div
          ref={(element) => { if (element) fields.current.set(row.id, element); else fields.current.delete(row.id); }}
          className="math-input__field"
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck={false}
          role="textbox"
          aria-multiline="false"
          aria-label={`${ariaLabel}, row ${index + 1}`}
          data-row={row.id}
          data-placeholder={placeholder}
          data-empty={isBlank(row.content) ? "" : undefined}
          // React owns every child of this element, so writing assistants that inject
          // their own nodes into editable fields are asked to keep out of it.
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          onFocus={(event) => {
            setActiveRowId(row.id);
            if (live.current.caret?.rowId === row.id) return;
            commit({ rows: live.current.rows, caret: { rowId: row.id, range: selectionFromDom(event.currentTarget) ?? collapsedAt(rowEnd(row.content)) } });
          }}
          onBlur={() => setActiveRowId(null)}
          onKeyDown={(event) => onKeyDown(event, row.id)}
          onPaste={(event) => {
            event.preventDefault();
            dispatch(row.id, { type: "insertText", text: event.clipboardData.getData("text") });
          }}
          onMouseDown={(event) => {
            // Clicks on text are placed by the browser; clicks on a fraction bar, a
            // bracket, a radical or slot padding are not, so those are hit-tested here.
            if (disabled || event.button !== 0 || (event.target as Element).closest(".math-input__text")) return;
            const position = positionFromPoint(event.currentTarget, event.clientX, event.clientY);
            if (!position) return;
            event.preventDefault();
            event.currentTarget.focus();
            dispatch(row.id, { type: "select", selection: collapsedAt(position) });
          }}
        >{renderNodes(row.content)}</div>
        {activeRowId === row.id && <button type="button" className="math-input__new-row" onMouseDown={(event) => event.preventDefault()} onClick={createRow} disabled={disabled} aria-label="Add new formula row" title="New line"><EditorIcon name="newLine" /></button>}
      </div>)}
    </div>
  </div>;
}

export default MathInput;

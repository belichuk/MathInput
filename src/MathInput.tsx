import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, Fragment, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./MathInput.css";
import { type FormulaNode, type SelectionRange, collapsedAt, encodePath, isBlank, samePosition } from "./model";
import { clampPosition, rowEnd, rowStart, stepThroughSlots, stepVertically } from "./caret";
import { type Action, type CompoundKind, type RowState, reduce } from "./reducers";
import { parseLatex } from "./parse";
import { serializeToLatex } from "./serialize";
import { renderNodes } from "./render";
import { applySelection, caretScrollOffset, positionFromPoint, repairField, selectionFromDom } from "./selection";
import { type History, emptyHistory, record, redo, undo } from "./history";

export type MathInputProps = {
  /** One LaTeX-compatible expression per line. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Show a row's tools only while it has focus. Off keeps them on the last used row. */
  autoHideToolbar?: boolean;
  /** The `+ − : ⋅` group. Off for a field only ever filled in from a keyboard. */
  showOperators?: boolean;
  /** The `← →` group, which moves the caret through a formula the arrow keys' way. */
  showNavigation?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

type Row = { id: string; content: FormulaNode[] };
type Caret = { rowId: string; range: SelectionRange } | null;
type EditorState = { rows: Row[]; caret: Caret };
/** What one row's ornaments want written, read off the page before anything is written to it. */
type RowOrnament = { field: HTMLDivElement; thumb: HTMLDivElement; scrollLeft: number | null; width: string; left: string };
type DividerOrnament = { divider: HTMLElement; together: boolean };
/** Subscripts are written with `_` rather than pressed, so they are not among the tools. */
type ToolKind = Exclude<CompoundKind, "subscript">;
type EditorIconName = ToolKind | "newLine" | "remove" | "plus" | "minus" | "divide" | "times" | "back" | "forward";

const NUMERAL = "M528 432C528 437 526 442 521 445C517 448 512 449 507 447L459 431C451 428 446 419 449 411C452 403 461 398 469 401L496 410V288H464C455 288 448 281 448 272C448 263 455 256 464 256H560C569 256 576 263 576 272C576 281 569 288 560 288H528V432Z";
const LETTER_X = "M80 384C71 384 64 377 64 368C64 359 71 352 80 352H119L221 192L119 32H80C71 32 64 25 64 16C64 7 71 0 80 0H128C134 0 139 3 142 7L240 162L339 7C341 3 347 0 352 0H400C409 0 416 7 416 16C416 25 409 32 400 32H361L259 192L361 352H400C409 352 416 359 416 368C416 377 409 384 400 384H352C347 384 341 381 339 377L240 222L142 377C139 381 134 384 128 384H80Z";
const RADICAL = "M352 384C345 384 339 379 337 372L223 -20C222 -27 216 -31 210 -32C203 -33 197 -29 194 -24L83 184C80 189 75 192 69 192H16C7 192 0 199 0 208C0 217 7 224 16 224H69C87 224 103 214 111 199L204 26L306 381C312 402 331 416 352 416H560C569 416 576 409 576 400C576 391 569 384 560 384H352Z";

/**
 * `paths` are filled outlines lifted from a font, so they are drawn y-up and flipped into
 * place; `strokes`, `rings`, `dots` and `index` are drawn in the box's own coordinates,
 * which is what the symbols written here rather than taken from a typeface use.
 */
type Point = [number, number, number];
type Glyph = { width: number; paths?: string[]; strokes?: string[]; rings?: Point[]; dots?: Point[]; index?: string };

/**
 * Every glyph, once, at module scope.
 *
 * This was a literal inside the component, so each of the eleven tools and the two row
 * buttons rebuilt the whole table — thirteen entries and their arrays — to read one field
 * out of it, on every render of every toolbar. The strings themselves were never the cost;
 * the objects around them were.
 *
 * `frac` is drawn from the primitives the others already use rather than from an outline of
 * its own: it is a bar between two hollow rings, which is exactly what a ring and a stroke
 * describe, and the 494-byte path it replaces was that same drawing written out as a filled
 * region. `remove` and the `x` in `power` keep their outlines — they cost 340 and 181 bytes
 * gzipped between them, and both are letter-like shapes whose weight a 34-unit stroke would
 * visibly coarsen, `power` beside a numeral taken from the same typeface.
 */
const GLYPHS: Record<EditorIconName, Glyph> = {
  sqrt: { width: 576, paths: [RADICAL] },
  // The same radical, with the index drawn where a root's index sits.
  cubeRoot: { width: 576, paths: [RADICAL], index: "3" },
  frac: { width: 448, strokes: ["M16 192H432"], rings: [[224, 40, 40], [224, 344, 40]] },
  power: { width: 576, paths: [LETTER_X, NUMERAL] },
  group: { width: 448, strokes: ["M170 0C60 100 60 288 170 384", "M278 0C388 100 388 288 278 384"] },
  plus: { width: 448, strokes: ["M64 192H384", "M224 32V352"] },
  minus: { width: 448, strokes: ["M64 192H384"] },
  // The two signs the editor writes as characters: a raised dot for multiplication —
  // never a cross — and the colon for division, which is the fraction's inline form.
  times: { width: 448, dots: [[224, 192, 72]] },
  divide: { width: 448, dots: [[224, 102, 52], [224, 282, 52]] },
  back: { width: 448, strokes: ["M384 192H64", "M176 80 64 192 176 304"] },
  forward: { width: 448, strokes: ["M64 192H384", "M272 80 384 192 272 304"] },
  newLine: { width: 512, paths: ["M480 368C480 377 487 384 496 384C505 384 512 377 512 368V272C512 219 469 176 416 176H55L171 59C178 53 178 43 171 37C165 30 155 30 149 37L5 181C2 184 0 188 0 192C0 196 2 200 5 203L149 347C155 353 165 353 171 347C178 341 178 331 171 325L55 208H416C451 208 480 237 480 272V368Z"] },
  remove: { width: 448, paths: ["M176 432C169 432 163 427 161 421L150 384H299L288 421C286 427 279 432 272 432H176ZM130 430C136 450 155 464 176 464H272C293 464 312 450 318 430L332 384H432C441 384 448 377 448 368C448 359 441 352 432 352H16C7 352 0 359 0 368C0 377 7 384 16 384H116L130 430ZM52 -5 29 304H61L84 -2C85 -19 99 -32 115 -32H333C349 -32 363 -19 364 -2L387 304H419L396 -5C394 -38 366 -64 333 -64H115C82 -64 54 -38 52 -5ZM157 227C163 233 173 233 179 227L224 183L269 227C275 233 285 233 291 227C298 221 298 211 291 205L247 160L291 115C298 109 298 99 291 93C285 86 275 86 269 93L224 137L179 93C173 86 163 86 157 93C151 99 151 109 157 115L201 160L157 205C151 211 151 221 157 227Z"] },
};

function EditorIcon({ name }: { name: EditorIconName }) {
  const glyph = GLYPHS[name];

  return <svg className="math-input__icon" viewBox={`0 -64 ${glyph.width} 512`} fill="currentColor" aria-hidden="true">
    {glyph.paths ? <g transform="translate(0 384) scale(1 -1)">
      {glyph.paths.map((path) => <path key={path} d={path} />)}
    </g> : null}
    {glyph.strokes || glyph.rings ? <g stroke="currentColor" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" fill="none">
      {glyph.strokes?.map((path) => <path key={path} d={path} />)}
      {glyph.rings?.map(([x, y, radius]) => <circle key={`${x} ${y}`} cx={x} cy={y} r={radius} />)}
    </g> : null}
    {glyph.dots?.map(([x, y, radius]) => <circle key={`${x} ${y}`} cx={x} cy={y} r={radius} />)}
    {glyph.index ? <text x="24" y="112" fontSize="230" fontWeight="700" fill="currentColor">{glyph.index}</text> : null}
  </svg>;
}

/**
 * The toolbar, in the three groups a divider separates: the formulas that have to be
 * built, the operators that are only characters — offered because a formula is written
 * on a tablet as often as on a keyboard — and the caret, for hands that are not on the
 * arrow keys. Everything a button does is an ordinary action, the same one the matching
 * key dispatches.
 */
type ToolGroupKey = "formulas" | "operators" | "navigation";

const TOOL_GROUPS: { key: ToolGroupKey; label: string; tools: { icon: EditorIconName; label: string; title: string; action: Action }[] }[] = [
  {
    key: "formulas",
    label: "Formulas",
    tools: [
      { icon: "sqrt", label: "Insert square root", title: "Square root", action: { type: "insertCompound", kind: "sqrt" } },
      { icon: "cubeRoot", label: "Insert cube root", title: "Cube root", action: { type: "insertCompound", kind: "cubeRoot" } },
      { icon: "frac", label: "Insert fraction", title: "Fraction", action: { type: "insertCompound", kind: "frac" } },
      { icon: "power", label: "Insert power", title: "Power", action: { type: "insertCompound", kind: "power" } },
      { icon: "group", label: "Insert brackets", title: "Brackets", action: { type: "insertCompound", kind: "group" } },
    ],
  },
  {
    key: "operators",
    label: "Operators",
    tools: [
      { icon: "plus", label: "Insert a plus", title: "Plus", action: { type: "insertText", text: "+" } },
      { icon: "minus", label: "Insert a minus", title: "Minus", action: { type: "insertText", text: "-" } },
      { icon: "divide", label: "Insert a division sign", title: "Divide", action: { type: "insertText", text: ":" } },
      // `*` is written as `⋅` and emitted as `\cdot`, exactly as the key is.
      { icon: "times", label: "Insert a multiplication dot", title: "Multiply", action: { type: "insertText", text: "*" } },
    ],
  },
  {
    key: "navigation",
    label: "Move the caret",
    tools: [
      { icon: "back", label: "Move the caret back", title: "Back", action: { type: "move", direction: "backward" } },
      { icon: "forward", label: "Move the caret on", title: "Forward", action: { type: "move", direction: "forward" } },
    ],
  },
];

/**
 * Single characters that mean something other than themselves: structure, or a move.
 * Read from `beforeinput` rather than `keydown`, so a mobile keyboard's space bar and a
 * desktop one are the same key.
 */
const KEYED_ACTION: Record<string, Action> = {
  " ": { type: "skip" },
  "\u00a0": { type: "skip" }, // some keyboards report the space bar as a non-breaking space
  "/": { type: "divide" },
  "÷": { type: "divide" },
  "^": { type: "script", kind: "power" },
  _: { type: "script", kind: "subscript" },
  "=": { type: "equals" },
  "(": { type: "insertCompound", kind: "group" },
  ")": { type: "closeGroup" },
  // The character opens the formula, the way `/` does. It is not on most keyboards, but it is
  // on every soft one's symbol page, it survives dictation and autocorrect, and it can be
  // pasted — which until now were the only ways to get a root without reaching for the mouse.
  // Typing the *word* `sqrt` is token recognition and waits for 0.6.0.
  "√": { type: "insertCompound", kind: "sqrt" },
  "∛": { type: "insertCompound", kind: "cubeRoot" },
};

/**
 * The editor a row is drawn against: everything except the row itself.
 *
 * One object rather than eighteen props, and every handler takes the id of the row calling
 * it rather than being closed over one — both so that `EditorRow` can be memoised, which is
 * the only reason any of this indirection is here.
 */
type RowShell = {
  disabled: boolean;
  placeholder: string;
  ariaLabel: string;
  groups: typeof TOOL_GROUPS;
  registerField: (rowId: string, element: HTMLDivElement | null) => void;
  registerThumb: (rowId: string, element: HTMLDivElement | null) => void;
  runTool: (rowId: string, action: Action) => void;
  removeRow: (rowId: string) => void;
  createRow: () => void;
  focusField: (rowId: string, field: HTMLDivElement) => void;
  blurField: () => void;
  scrollField: (rowId: string) => void;
  repair: (rowId: string, field: HTMLDivElement) => void;
  startComposition: () => void;
  endComposition: (rowId: string, field: HTMLDivElement, data: string) => void;
  paste: (rowId: string, text: string) => void;
  pickPosition: (rowId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  dragScrollbar: (rowId: string, event: ReactPointerEvent<HTMLDivElement>) => void;
};

const swallow = (event: { preventDefault: () => void }) => event.preventDefault();

/**
 * One row: its tools, its field, its scroll indicator.
 *
 * Memoised, and this is the dividend the immutable tree has been paying for without ever
 * collecting. An edit replaces the row it touched and shares every other row by reference,
 * so a fifty-row worksheet re-rendered fifty rows on a keystroke that changed one of them —
 * fifty trees walked, fifty sets of JSX built, fifty diffs taken, forty-nine of them against
 * a tree that could not possibly have changed because it is the same object.
 *
 * The comparison is React's own shallow one, which is exactly right here: `row` is the
 * reference the reducer either replaced or did not.
 */
/**
 * The toolbar, as the toolbar pattern actually asks for it: **one tab stop**, with the arrow
 * keys moving between the buttons inside it.
 *
 * Eleven separate tab stops was always wrong, and `Tab` walking the slots of a formula made it
 * worse rather than merely leaving it: `Tab` out of the last slot used to land on whatever came
 * after the editor, and now it lands here, at the first of eleven. Somebody filling in a
 * worksheet by keyboard would meet the whole strip between one row and the next.
 *
 * Its own component, and its own state, so that moving between buttons re-renders the toolbar
 * and not the row — the row is memoised precisely so a keystroke does not redraw a formula.
 */
function Toolbar({ row, index, removable, shell }: { row: string; index: number; removable: boolean; shell: RowShell }) {
  const { disabled, groups } = shell;
  const [active, setActive] = useState(0);
  const strip = useRef<HTMLDivElement | null>(null);

  const controls = [...groups.flatMap((group) => group.tools.map((tool) => ({
    key: tool.icon, label: tool.label, title: tool.title, icon: tool.icon, className: "math-input__tool",
    press: () => shell.runTool(row, tool.action),
  }))), ...(removable ? [{
    key: "remove", label: "Remove formula row", title: "Remove", icon: "remove" as EditorIconName,
    className: "math-input__remove-row", press: () => shell.removeRow(row),
  }] : [])];

  // The arrow keys move along the strip and wrap, `Home` and `End` jump to its ends. Focus
  // follows, because a roving tabindex that does not move focus is only half of the pattern.
  const steer = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const at = step === -Infinity ? 0 : step === Infinity ? controls.length - 1 : (active + step + controls.length) % controls.length;
    setActive(at);
    strip.current?.querySelectorAll<HTMLButtonElement>("button")[at]?.focus();
  };

  let at = -1;
  const stop = () => { at += 1; return at; };

  return <div className="math-input__toolbar" role="toolbar" ref={strip} aria-label={`Formula tools for row ${index + 1}`} onKeyDown={steer}>
    {groups.map((group, group_at) => <Fragment key={group.key}>
      {group_at > 0 && <span className="math-input__toolbar-divider" aria-hidden="true" />}
      <div className="math-input__tool-group" role="group" aria-label={group.label}>
        {group.tools.map((tool) => {
          const here = stop();
          return <button key={tool.icon} type="button" className="math-input__tool" tabIndex={here === active ? 0 : -1} onMouseDown={swallow} onFocus={() => setActive(here)} onClick={controls[here].press} disabled={disabled} aria-label={tool.label} title={tool.title}><EditorIcon name={tool.icon} /></button>;
        })}
      </div>
    </Fragment>)}
    {removable && (() => {
      const here = stop();
      return <button type="button" className="math-input__remove-row" tabIndex={here === active ? 0 : -1} onMouseDown={swallow} onFocus={() => setActive(here)} onClick={controls[here].press} aria-label="Remove formula row" title="Remove"><EditorIcon name="remove" /></button>;
    })()}
  </div>;
}

const EditorRow = memo(function EditorRow({ row, index, removable, wearsTools, shell }: { row: Row; index: number; removable: boolean; wearsTools: boolean; shell: RowShell }) {
  const { ariaLabel, disabled, placeholder } = shell;
  // Kept stable per row: a fresh ref callback on every render makes React detach and
  // reattach the element, and the edited row renders on every keystroke.
  const fieldRef = useCallback((element: HTMLDivElement | null) => shell.registerField(row.id, element), [shell, row.id]);
  const thumbRef = useCallback((element: HTMLDivElement | null) => shell.registerThumb(row.id, element), [shell, row.id]);

  return <div className="math-input__row">
    {wearsTools && <Toolbar row={row.id} index={index} removable={removable} shell={shell} />}
    <div
      ref={fieldRef}
      className="math-input__field"
      contentEditable={!disabled}
      // Focusability comes from `contentEditable`, which a disabled row does not have — so
      // without this a read-only formula drops out of the tab order altogether and cannot be
      // reached to be read or copied.
      tabIndex={0}
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
      onFocus={(event) => shell.focusField(row.id, event.currentTarget)}
      onBlur={shell.blurField}
      onScroll={() => shell.scrollField(row.id)}
      onInput={(event) => shell.repair(row.id, event.currentTarget)}
      onCompositionStart={shell.startComposition}
      onCompositionEnd={(event) => shell.endComposition(row.id, event.currentTarget, event.data)}
      onPaste={(event) => { event.preventDefault(); shell.paste(row.id, event.clipboardData.getData("text")); }}
      onMouseDown={(event) => shell.pickPosition(row.id, event)}
    >{renderNodes(row.content)}</div>
    <div className="math-input__scrollbar" aria-hidden="true">
      <div
        className="math-input__scrollbar-thumb"
        ref={thumbRef}
        onPointerDown={(event) => shell.dragScrollbar(row.id, event)}
        onMouseDown={swallow}
      />
    </div>
    {wearsTools && <button type="button" className="math-input__new-row" onMouseDown={swallow} onClick={shell.createRow} disabled={disabled} aria-label="Add new formula row" title="New line"><EditorIcon name="newLine" /></button>}
  </div>;
});

const BACKWARD_DELETIONS = ["deleteContentBackward", "deleteWordBackward", "deleteSoftLineBackward", "deleteHardLineBackward", "deleteByCut", "deleteByDrag", "deleteContent"];
const FORWARD_DELETIONS = ["deleteContentForward", "deleteWordForward", "deleteSoftLineForward", "deleteHardLineForward"];

const latexOf = (rows: Row[]): string => rows.map((row) => serializeToLatex(row.content)).join("\n");
const toRows = (latex: string): Row[] => latex.split("\n").map((line) => ({ id: crypto.randomUUID(), content: parseLatex(line) }));
const sameRange = (first: SelectionRange, second: SelectionRange): boolean => samePosition(first.anchor, second.anchor) && samePosition(first.focus, second.focus);

/** A dependency-free, visual formula editor that emits LaTeX-compatible text. */
export function MathInput({ value, defaultValue = "", onChange, placeholder = "Write a formula…", disabled = false, autoHideToolbar = true, showOperators = true, showNavigation = true, className = "", style, "aria-label": ariaLabel = "Math editor" }: MathInputProps) {
  const [state, setState] = useState<EditorState>(() => ({ rows: toRows(value ?? defaultValue), caret: null }));
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  /** The row the caret last sat in, which keeps the tools when they are not auto-hidden. */
  const [restingRowId, setRestingRowId] = useState<string | null>(null);
  const fields = useRef(new Map<string, HTMLDivElement>());
  const frame = useRef<HTMLDivElement | null>(null);
  /** Mirrors `state` so event handlers read the current tree without re-subscribing. */
  const live = useRef(state);
  const history = useRef<History<EditorState>>(emptyHistory());
  const composing = useRef(false);
  /** Keys taken on keydown, so their keyup can be taken too rather than reaching the host. */
  const consumedKeys = useRef(new Set<string>());
  const pendingFocus = useRef<string | null>(null);
  const published = useRef<string | null>(null);
  /** Each row's scrollbar thumb, driven through the DOM: scrolling must not re-render the tree. */
  const thumbs = useRef(new Map<string, HTMLDivElement>());
  /** How many rows the ornaments were last drawn for, which is how a row appearing is noticed. */
  const drawnRows = useRef(-1);
  /** The slot currently wearing the caret mark, so putting it elsewhere is two attribute writes. */
  const markedSlot = useRef<HTMLElement | null>(null);
  const labelId = useId();
  if (published.current === null) published.current = latexOf(state.rows);

  /**
   * The scrollbar is drawn over the field rather than inside it. A native one takes its
   * height out of the row, so a row would grow the moment its formula outgrew it and
   * shrink again on the next backspace; this one shows the same thing and costs nothing.
   *
   * Split in two, because the split is the whole point: `measureRow` only reads the page
   * and `paintRow` only writes it. Every ornament pass below reads everything it is going
   * to need before it writes anything, so a keystroke costs the browser one layout instead
   * of one per read that followed a write.
   */
  const measureRow = useCallback((rowId: string, scrollBy = 0): RowOrnament | null => {
    const field = fields.current.get(rowId);
    const thumb = thumbs.current.get(rowId);
    if (!field || !thumb) return null;
    // Each of these was asked for three times over, which is three chances to be answered
    // by a fresh layout rather than the same one.
    const scrollWidth = field.scrollWidth;
    const clientWidth = field.clientWidth;
    const scrollLeft = field.scrollLeft;
    const scrollable = scrollWidth - clientWidth;
    const wanted = Math.max(0, Math.min(scrollLeft + scrollBy, scrollable));
    // A very long formula would leave a thumb too small to see, let alone grab.
    const ratio = Math.max(clientWidth / scrollWidth, 0.08);
    const travelled = scrollable > 0 ? wanted / scrollable : 0;
    return {
      field,
      thumb,
      scrollLeft: wanted === scrollLeft ? null : wanted,
      width: scrollable <= 1 ? "0" : `${ratio * 100}%`,
      left: scrollable <= 1 ? "0" : `${travelled * (100 - ratio * 100)}%`,
    };
  }, []);

  const paintRow = useCallback((ornament: RowOrnament | null) => {
    if (!ornament) return;
    if (ornament.scrollLeft !== null) ornament.field.scrollLeft = ornament.scrollLeft;
    ornament.thumb.style.width = ornament.width;
    ornament.thumb.style.left = ornament.left;
  }, []);

  /**
   * A toolbar too wide for its field wraps, and a divider left at the end of a line
   * divides nothing: what it stood between is on the next line, which already separates
   * them. Those are hidden rather than taken out of the flow — removing one would give
   * the line back the room that made it wrap, so the two would take turns undoing each
   * other. A group that shares its line with the divider before it keeps that divider.
   */
  const measureDividers = useCallback((): DividerOrnament[] =>
    [...(frame.current?.querySelectorAll<HTMLElement>(".math-input__toolbar-divider") ?? [])].map((divider) => {
      const group = divider.nextElementSibling as HTMLElement | null;
      return { divider, together: !!group && group.offsetTop < divider.offsetTop + divider.offsetHeight };
    }), []);

  /**
   * Everything drawn from measurement rather than from state, in one read and then one write.
   *
   * `rowIds` is which rows to redraw, and on an ordinary keystroke it is one: a row nobody
   * touched cannot have changed how far it scrolls, so redrawing all of them was work
   * proportional to the worksheet for an edit that was proportional to nothing. Rows change
   * size for reasons other than editing, and those reach here through the `ResizeObserver`
   * below, which is where they belong.
   */
  const syncFrame = useCallback((rowIds: Iterable<string>, caret: Caret = null) => {
    // ---- read ----
    const caretField = caret ? fields.current.get(caret.rowId) : undefined;
    let caretScroll = 0;
    // Writing the selection is not a layout write: it moves no box, so the reads that
    // follow it are still answered by the one layout this pass forces. And it has to come
    // first, because what is measured next is where the caret has just been put.
    if (caret && caretField && !composing.current && document.activeElement === caretField && applySelection(caretField, caret.range)) {
      caretScroll = caretScrollOffset(caretField);
    }
    const rows = Array.from(rowIds, (rowId) => measureRow(rowId, rowId === caret?.rowId ? caretScroll : 0));
    const dividers = measureDividers();

    // ---- write ----
    for (const row of rows) paintRow(row);
    for (const { divider, together } of dividers) divider.style.visibility = together ? "" : "hidden";

    /**
     * Which slot the caret is in, marked on the element rather than rendered into it.
     *
     * An ornament, like the scroll indicator and the dividers: written from here after every
     * render, idempotent, and costing no re-render at all — which matters, because the slot
     * under the caret changes on almost every keystroke and re-rendering the row to say so
     * would undo the memoisation that makes a keystroke cheap. Rendering stays a pure
     * function of the document, since the document does not know where the caret is.
     *
     * A caret path names the run it sits in; the slot holding that run is the same path
     * without its last step, which is exactly the address the renderer stamped on the slot.
     */
    const inSlot = caret && caretField
      ? caretField.querySelector<HTMLElement>(`[data-slot][data-path="${encodePath(caret.range.focus.path.slice(0, -1))}"]`)
      : null;
    if (markedSlot.current !== inSlot) {
      markedSlot.current?.removeAttribute("data-caret-slot");
      inSlot?.setAttribute("data-caret-slot", "");
      markedSlot.current = inSlot;
    }
  }, [measureRow, paintRow, measureDividers]);

  const syncEveryRow = useCallback(() => { syncFrame(fields.current.keys()); }, [syncFrame]);

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

  // A toolbar that stays put can be used while its row is not focused, and an edit whose
  // caret nobody can see is no use, so the row is focused along with it.
  const focusRow = useCallback((id: string) => {
    if (document.activeElement !== fields.current.get(id)) pendingFocus.current = id;
  }, []);

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

  /**
   * One pass over the page per render: put the caret where the model says it is, scroll it
   * into view, and redraw the ornaments — reading all of it, then writing all of it.
   *
   * These were two effects, and between them they read the page, wrote it, and read it
   * again three times over. They are one now because there is only one thing to be done
   * here and one moment to do it in; splitting it into passes that each measured after the
   * last one had written is what made a keystroke cost three layouts instead of one.
   *
   * Putting the caret back is also the repair for stray native movement, so this runs after
   * every render and is a no-op whenever the DOM already agrees.
   */
  useLayoutEffect(() => {
    // Every row when the set of them changed — a row added, removed, or the whole document
    // replaced by a new `value` — and the edited row alone otherwise.
    const focused = state.caret?.rowId;
    const swept = drawnRows.current !== state.rows.length || !focused || !fields.current.has(focused);
    drawnRows.current = state.rows.length;
    syncFrame(swept ? fields.current.keys() : [focused], state.caret);
  });

  useEffect(() => {
    const container = frame.current;
    if (!container) return;
    const observer = new ResizeObserver(syncEveryRow);
    observer.observe(container);
    return () => observer.disconnect();
  }, [syncEveryRow]);

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    const field = id ? fields.current.get(id) : undefined;
    if (!id || !field) return;
    pendingFocus.current = null;
    field.focus();
    if (live.current.caret?.rowId === id) applySelection(field, live.current.caret.range);
  }, [state]);

  /**
   * The three listeners React cannot stand in for. Everything else the editor listens to
   * — input, composition, scroll, focus, paste, pointers — is an ordinary React prop on
   * the field below.
   *
   * `keydown`/`keyup` because React attaches its listeners at the root of the tree, so a
   * synthetic `stopPropagation` only runs once the event has already passed every
   * ancestor between the field and that root. The keyboard policy has to stop a key
   * before the host can see it, which means stopping it here, at the frame.
   *
   * `beforeinput` because React's synthetic version is reconstructed rather than the real
   * event, and carries no `inputType` — the one property every editing decision is made
   * from, and the only trustworthy account of what a mobile keyboard just did.
   */
  useEffect(() => {
    const container = frame.current;
    if (!container) return;
    const fieldOf = (target: EventTarget | null): HTMLElement | null => {
      const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
      return element?.closest<HTMLElement>(".math-input__field") ?? null;
    };

    /**
     * The keyboard policy. A key that is part of writing a formula belongs to the editor
     * alone: it stops here, so the page around it never fires a shortcut on a keystroke
     * the user aimed at a formula. `preventDefault` is separate, and only for keys the
     * editor acts on itself — typing and deletion are still performed by `beforeinput`.
     * Everything the editor has no use for is left untouched: Tab still moves focus, and
     * application shortcuts such as Cmd/Ctrl+S still reach the application.
     */
    const onKeyDown = (event: Event) => {
      const key = event as KeyboardEvent;
      const field = fieldOf(key.target);
      const rowId = field?.dataset.row;
      if (!field || !rowId || disabled) return;
      const take = (act: boolean) => {
        consumedKeys.current.add(key.key);
        key.stopPropagation();
        if (act) key.preventDefault();
      };

      // While an IME is composing, the keystrokes are the editor's but not ours to act on.
      if (composing.current || key.isComposing) return take(false);
      if (key.metaKey || key.ctrlKey) {
        const shortcut = key.key.toLowerCase();
        if (shortcut === "z") { take(true); restore(key.shiftKey ? "redo" : "undo"); }
        else if (shortcut === "y") { take(true); restore("redo"); }
        return; // every other shortcut, including Select All and Copy, stays native
      }
      // Escape leaves the field, on the release rather than here — a field that blurred
      // under the pressed key would send the keyup to the page instead. The host sees
      // this one no more than the rest, so a dialog around the editor closes on the
      // second press, once the editor is out.
      if (key.key === "Escape") return take(true);
      /**
       * Tab walks the boxes of a formula rather than the characters: open a fraction, write
       * the numerator, Tab, write the denominator. With no slot left in that direction it is
       * not taken at all, and the browser moves focus out of the field the way it does
       * everywhere else — which is what keeps this from being a keyboard trap.
       */
      if (key.key === "Tab") {
        const current = live.current;
        const row = current.rows.find((candidate) => candidate.id === rowId);
        const caret = current.caret?.rowId === rowId ? current.caret.range.focus : null;
        const target = row && caret ? stepThroughSlots(row.content, caret, key.shiftKey ? "backward" : "forward") : null;
        if (!target) return;
        take(true);
        dispatch(rowId, { type: "select", selection: collapsedAt(target) });
        return;
      }
      if (key.shiftKey && key.key.startsWith("Arrow")) return take(false); // native selection extension
      if (key.key === "ArrowLeft" || key.key === "ArrowRight") {
        take(true);
        dispatch(rowId, { type: "move", direction: key.key === "ArrowLeft" ? "backward" : "forward" });
        return;
      }
      /**
       * ↑ and ↓ move between the slots a construct stacks — a fraction's numerator and its
       * denominator, an exponent and its base — and between rows when nothing around the
       * caret stacks anything. Both are answered from the tree: which slot is above which is
       * declared in the registry, and where in it the caret lands is arithmetic on offsets.
       */
      if (key.key === "ArrowUp" || key.key === "ArrowDown") {
        take(true);
        const direction = key.key === "ArrowUp" ? "up" : "down";
        const current = live.current;
        const row = current.rows.find((candidate) => candidate.id === rowId);
        const caret = current.caret?.rowId === rowId ? current.caret.range.focus : null;
        const within = row && caret ? stepVertically(row.content, caret, direction) : null;
        if (within) { dispatch(rowId, { type: "select", selection: collapsedAt(within) }); return; }

        const at = current.rows.findIndex((candidate) => candidate.id === rowId);
        const next = current.rows[at + (direction === "up" ? -1 : 1)];
        if (!next) return;
        pendingFocus.current = next.id;
        // The same distance along the next row as the caret had come along this one, which is
        // the nearest thing to a column that a document with no geometry has.
        commit({ rows: current.rows, caret: { rowId: next.id, range: collapsedAt(clampPosition(next.content, { path: [{ index: 0 }], offset: caret?.offset ?? 0 })) } });
        return;
      }
      if (key.key === "Home" || key.key === "End") {
        take(true);
        dispatch(rowId, { type: "moveToEdge", edge: key.key === "Home" ? "start" : "end" });
        return;
      }
      // Shift+Enter reaches the editor as a line break through beforeinput, so that one
      // is only stopped, not answered here.
      if (key.key === "Enter") {
        take(!key.shiftKey);
        if (!key.shiftKey) createRow();
        return;
      }
      if (key.key.length === 1 || key.key === "Backspace" || key.key === "Delete") take(false);
    };

    // The release of a key the editor took is taken too: a host counting keyups never
    // sees half of a keystroke that was never addressed to it.
    const onKeyUp = (event: Event) => {
      const key = event as KeyboardEvent;
      if (!consumedKeys.current.delete(key.key)) return;
      key.stopPropagation();
      if (key.key === "Escape") fieldOf(key.target)?.blur();
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

    container.addEventListener("keydown", onKeyDown);
    container.addEventListener("keyup", onKeyUp);
    container.addEventListener("beforeinput", onBeforeInput);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("keyup", onKeyUp);
      container.removeEventListener("beforeinput", onBeforeInput);
    };
  }, [disabled, dispatch, createRow, restore]);

  /** Undoes whatever reached the DOM without going through a reducer. */
  const repair = useCallback((rowId: string, field: HTMLDivElement) => {
    const row = live.current.rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    repairField(field, row.content);
    if (live.current.caret?.rowId === rowId) applySelection(field, live.current.caret.range);
  }, []);

  const endComposition = useCallback((rowId: string, field: HTMLDivElement, data: string) => {
    composing.current = false;
    // Undo the IME's direct DOM edits so React's next render diffs against reality,
    // then apply the composed text as one ordinary insertion.
    repair(rowId, field);
    if (data) dispatch(rowId, { type: "insertText", text: data });
  }, [repair, dispatch]);

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

  /**
   * Dragging a row's scrollbar scrolls that row and nothing else. Its `mousedown` is
   * cancelled — the same way the tool buttons cancel theirs — so the row being edited
   * keeps the focus and the caret: reading one line is no reason to lose your place in
   * another.
   */
  const dragScrollbar = useCallback((rowId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const field = fields.current.get(rowId);
    const thumb = event.currentTarget;
    const track = thumb.parentElement;
    if (!field || !track || event.button !== 0) return;
    const from = event.clientX;
    const scrolled = field.scrollLeft;
    const travel = track.clientWidth - thumb.offsetWidth;
    const scale = travel > 0 ? (field.scrollWidth - field.clientWidth) / travel : 0;
    // Followed on the window rather than the thumb: the pointer leaves a 6px-tall bar the
    // moment the drag starts, and a captured pointer is not delivered everywhere.
    const onMove = (move: PointerEvent) => { field.scrollLeft = scrolled + (move.clientX - from) * scale; };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }, []);

  const focusField = useCallback((rowId: string, field: HTMLDivElement) => {
    setActiveRowId(rowId);
    setRestingRowId(rowId);
    if (live.current.caret?.rowId === rowId) return;
    const row = live.current.rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    commit({ rows: live.current.rows, caret: { rowId, range: selectionFromDom(field) ?? collapsedAt(rowEnd(row.content)) } });
  }, [commit]);

  const pickPosition = useCallback((rowId: string, event: ReactMouseEvent<HTMLDivElement>) => {
    // Clicks on text are placed by the browser; clicks on a fraction bar, a bracket, a
    // radical or slot padding are not, so those are hit-tested here.
    if (disabled || event.button !== 0 || (event.target as Element).closest(".math-input__text")) return;
    const position = positionFromPoint(event.currentTarget, event.clientX, event.clientY);
    if (!position) return;
    event.preventDefault();
    event.currentTarget.focus();
    dispatch(rowId, { type: "select", selection: collapsedAt(position) });
  }, [disabled, dispatch]);

  // Which row wears the tools: the focused one, or — when they are pinned — the row the
  // caret last sat in, falling back to the first so a fresh editor still shows them.
  const toolbarRowId = useMemo(() => {
    const existing = (id: string | null) => (state.rows.some((row) => row.id === id) ? id : null);
    return existing(activeRowId) ?? (autoHideToolbar ? null : existing(restingRowId) ?? state.rows[0].id);
  }, [state.rows, activeRowId, restingRowId, autoHideToolbar]);

  /**
   * The shell a row is drawn against: everything about the editor that is not this row.
   *
   * Memoised, and every handler in it takes the id of the row it is acting on, because
   * `EditorRow` is memoised and neither of those is optional for that to mean anything. A
   * handler closed over one row would be a new function for every row on every render, and
   * an object rebuilt each render would fail the comparison on its own.
   */
  const shell: RowShell = useMemo(() => ({
    disabled,
    placeholder,
    ariaLabel,
    // Filtered before it is drawn, so the dividers follow the groups that are actually
    // there rather than a hidden one leaving its line behind.
    groups: TOOL_GROUPS.filter((group) => (group.key === "operators" ? showOperators : group.key === "navigation" ? showNavigation : true)),
    registerField: (rowId, element) => { if (element) fields.current.set(rowId, element); else fields.current.delete(rowId); },
    registerThumb: (rowId, element) => { if (element) thumbs.current.set(rowId, element); else thumbs.current.delete(rowId); },
    // A toolbar that stays put can be used while its row is not focused, and an edit whose
    // caret nobody can see is no use, so the row is focused along with it.
    runTool: (rowId, action) => { focusRow(rowId); dispatch(rowId, action); },
    removeRow,
    createRow,
    focusField,
    blurField: () => { consumedKeys.current.clear(); setActiveRowId(null); },
    // The row being scrolled, and only its thumb: a read and then a write, like every other
    // ornament pass, and the caret is not involved in a scroll.
    scrollField: (rowId) => paintRow(measureRow(rowId)),
    repair,
    startComposition: () => { composing.current = true; },
    endComposition,
    paste: (rowId, text) => dispatch(rowId, { type: "paste", text }),
    pickPosition,
    dragScrollbar,
  }), [disabled, placeholder, ariaLabel, showOperators, showNavigation, focusRow, dispatch, removeRow, createRow, focusField, paintRow, measureRow, repair, endComposition, pickPosition, dragScrollbar]);

  return <div className={`math-input ${className}`.trim()} style={style}>
    <div className="math-input__frame" ref={frame} aria-labelledby={labelId}>
      <span id={labelId} className="math-input__visually-hidden">{ariaLabel}</span>
      {state.rows.map((row, index) =>
        <EditorRow key={row.id} row={row} index={index} removable={state.rows.length > 1} wearsTools={toolbarRowId === row.id} shell={shell} />)}
    </div>
  </div>;
}

export default MathInput;

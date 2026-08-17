import { act } from "react";
import { createRoot } from "react-dom/client";
import { MathInput } from "../MathInput";

/**
 * What a keystroke costs, counted rather than traced.
 *
 * A browser's own profiler is the honest instrument for forced layout, and it is also
 * unavailable to a test: it needs a real browser, a running trace and a human reading a
 * flame chart. So this counts the same thing from the other end — the accessors the code
 * has to ask for, which are the only way a layout can be forced in the first place. Every
 * one of them is wrapped, and every call is logged in order.
 *
 * The order is what makes the count mean something. A run of reads costs one layout
 * however long it is; a read *after a write* costs another, because the write invalidated
 * what the last one computed. So `forcedLayouts` counts the reads a browser could not have
 * answered from the layout it already had: the first of the batch — React has just mutated
 * the DOM, so the page is dirty before the effects even start — and every read that
 * follows a write. That is the number the hot-path work is aiming at, and it is why
 * splitting an effect into a read phase and a write phase shows up here as a fall from
 * three to one while the read *count* barely moves.
 *
 * What is deliberately not counted as a write: `setBaseAndExtent`. Moving the selection
 * does not invalidate layout, so a read after it is not forced.
 */

export type Op = { kind: "read" | "write"; property: string };

const log: Op[] = [];
let recording = false;
const note = (kind: Op["kind"], property: string): void => { if (recording) log.push({ kind, property }); };

/**
 * The page jsdom will not lay out, described instead.
 *
 * jsdom answers every one of these with zero, and zero is not a neutral answer here — it
 * is a degenerate one that makes the code under measurement take shortcuts a real browser
 * never takes. A caret rectangle of no width and no height makes `scrollCaretIntoView`
 * return before its second read; a `scrollWidth` equal to its `clientWidth` hides the
 * scrollbar. So the harness states a plausible page and the code then does all of its work:
 * a field 800px wide holding a formula half again as wide, its toolbar on one line, and
 * the caret comfortably inside the field — far enough from either edge that scrolling it
 * into view has nothing to do, which is the ordinary case and the documented baseline. A
 * caret against the right-hand edge would add one read and one write of `scrollLeft` on
 * top of everything below.
 */
const GEOMETRY = {
  clientWidth: 800,
  scrollWidth: 1200,
  scrollLeft: 0,
  offsetTop: 0,
  offsetHeight: 24,
  offsetWidth: 32,
  fieldRect: new DOMRect(0, 0, 800, 40),
  caretRect: new DOMRect(100, 8, 8, 24),
};

let installed = false;

/**
 * Which field the harness says is focused.
 *
 * jsdom will not focus a `contenteditable` element — it has no tabindex and is not one of
 * the elements jsdom treats as focusable — and the caret pass does nothing at all unless
 * the row it is putting the caret in is the focused one. So the harness answers for it,
 * from one place rather than one stub per editor: a benchmark keeps several editors mounted
 * at once, and each has to be able to say it is the one being typed into.
 */
let focused: HTMLElement | null = null;

/** Wraps every accessor the component reads layout through, and every one it writes it through. */
export function installLayoutProbe(): void {
  if (installed) return;
  installed = true;

  Object.defineProperty(document, "activeElement", { configurable: true, get: () => focused });

  const modelled = (owner: object, property: string, value: number): void => {
    Object.defineProperty(owner, property, {
      configurable: true,
      get(): number { note("read", property); return value; },
    });
  };

  modelled(Element.prototype, "scrollWidth", GEOMETRY.scrollWidth);
  modelled(Element.prototype, "clientWidth", GEOMETRY.clientWidth);
  modelled(HTMLElement.prototype, "offsetTop", GEOMETRY.offsetTop);
  modelled(HTMLElement.prototype, "offsetHeight", GEOMETRY.offsetHeight);
  modelled(HTMLElement.prototype, "offsetWidth", GEOMETRY.offsetWidth);

  // The one accessor that is read and written both, so the written value has to stick:
  // `field.scrollLeft += n` is a read and a write, and the second keystroke must see the
  // first one's result.
  const scrolled = new WeakMap<object, number>();
  Object.defineProperty(Element.prototype, "scrollLeft", {
    configurable: true,
    get(this: object): number { note("read", "scrollLeft"); return scrolled.get(this) ?? GEOMETRY.scrollLeft; },
    set(this: object, value: number): void { note("write", "scrollLeft"); scrolled.set(this, value); },
  });

  Element.prototype.getBoundingClientRect = function (): DOMRect { note("read", "getBoundingClientRect"); return GEOMETRY.fieldRect; };
  // Absent from jsdom altogether rather than answering zero, so this one is defined, not wrapped.
  Range.prototype.getBoundingClientRect = function (): DOMRect { note("read", "Range.getBoundingClientRect"); return GEOMETRY.caretRect; };

  /**
   * Every style property, not the three the component writes today: a count that only
   * notices the writes it was told to look for would improve on its own the moment a
   * milestone wrote a fourth, which is the opposite of a gate.
   *
   * Counted once per assignment, however jsdom implements it underneath. Some of its
   * property setters reach the value through `setProperty` and some do not, so wrapping
   * both — which is the only way to catch code that calls `setProperty` itself — logs
   * some properties twice. One logical write is one write, so a nested one is not counted.
   */
  let writing = false;
  const noteWrite = (property: string, apply: () => void): void => {
    if (writing) return apply();
    note("write", property);
    writing = true;
    try { apply(); } finally { writing = false; }
  };

  for (const [property, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(CSSStyleDeclaration.prototype))) {
    if (!descriptor.configurable) continue;
    const write = descriptor.set;
    if (write) {
      Object.defineProperty(CSSStyleDeclaration.prototype, property, {
        ...descriptor,
        set(this: object, value: unknown): void { noteWrite(`style.${property}`, () => write.call(this, value)); },
      });
      continue;
    }
    if (property !== "setProperty" && property !== "removeProperty") continue;
    const method = descriptor.value as (this: object, ...rest: unknown[]) => unknown;
    Object.defineProperty(CSSStyleDeclaration.prototype, property, {
      ...descriptor,
      value(this: object, ...rest: unknown[]): unknown {
        let result: unknown;
        noteWrite(`style.${String(rest[0])}`, () => { result = method.call(this, ...rest); });
        return result;
      },
    });
  }
}

export type LayoutReport = {
  reads: number;
  writes: number;
  /** Reads a browser would have had to lay the page out to answer. The number M1 drives to one. */
  forcedLayouts: number;
  byProperty: Record<string, number>;
  ops: Op[];
};

function summarise(ops: Op[]): LayoutReport {
  const byProperty: Record<string, number> = {};
  let reads = 0;
  let writes = 0;
  let forcedLayouts = 0;
  // React has just written the DOM, so the first read of the batch is already a forced one.
  let dirty = true;
  for (const op of ops) {
    byProperty[op.property] = (byProperty[op.property] ?? 0) + 1;
    if (op.kind === "write") { writes += 1; dirty = true; continue; }
    reads += 1;
    if (dirty) { forcedLayouts += 1; dirty = false; }
  }
  return { reads, writes, forcedLayouts, byProperty, ops: [...ops] };
}

/**
 * The three shapes a field is really in, and they are not variations of one size.
 *
 * `answer` is the overwhelming majority of real fields — a box on a worksheet holding two
 * characters — and it is the one every per-keystroke cost has to be cheap for. `worksheet`
 * is fifty of them in one editor, where anything the editor does per *row* rather than per
 * edited row shows up multiplied. `nested` is one row eight constructs deep, where the
 * cost is the tree: rendering it, serialising it and walking it.
 *
 * All three type at the end of the row, which is where a field with no caret of its own
 * yet puts one. Depth changes what a keystroke costs in time, not in layout reads — those
 * follow the number of rows and toolbar dividers on the page, and nothing else.
 */
export type Fixture = { name: string; description: string; value: string };

const worksheet = Array.from({ length: 50 }, (_, row) => `x_{${row + 1}}=\\frac{${row + 1}}{${row + 2}}+\\sqrt{${row + 3}}`).join("\n");

const nested = ((): string => {
  let inner = "1";
  for (let depth = 0; depth < 8; depth += 1) inner = depth % 2 === 0 ? `\\frac{${inner}}{${depth + 2}}` : `\\sqrt{${inner}}`;
  return `y=${inner}`;
})();

export const FIXTURES: Fixture[] = [
  { name: "answer", description: "one row, a two-character answer", value: "42" },
  { name: "worksheet", description: "fifty rows of working", value: worksheet },
  { name: "nested", description: "one row, eight constructs deep", value: nested },
];

export type MountedEditor = {
  field: HTMLElement;
  /** Rows and dividers actually on the page, so an expected count is derived from it rather than assumed. */
  rows: number;
  dividers: number;
  /** One character, typed the way a keyboard types it: the real `beforeinput` the editor listens to. */
  type: (character: string) => LayoutReport;
  /** Backspace, as `beforeinput` reports it. Pairs with `type` to leave the row as it was found. */
  remove: () => LayoutReport;
  press: (key: string) => LayoutReport;
  /** Says this editor's first row is the focused one, which is what a caret pass needs to do anything. */
  focus: () => void;
  unmount: () => void;
};

export function mountEditor(fixture: Fixture): MountedEditor {
  installLayoutProbe();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  // Pinned rather than auto-hidden: the tools are on the row being typed into, which is
  // the state a user typing is in, and it is what puts the dividers on the page.
  act(() => root.render(<MathInput defaultValue={fixture.value} toolbar={{ autoHide: false }} />));

  const field = host.querySelector<HTMLElement>(".math-input__field");
  if (!field) throw new Error(`${fixture.name}: the editor rendered no field`);

  // Focused as far as the harness is concerned, and then told to the component through the
  // event React would have delivered, so the editor's own idea of its active row agrees.
  focused = field;
  act(() => { field.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });

  const record = (fire: () => void): LayoutReport => {
    log.length = 0;
    recording = true;
    try { act(fire); } finally { recording = false; }
    return summarise(log);
  };

  const input = (inputType: string, data: string | null): LayoutReport =>
    record(() => { field.dispatchEvent(new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true })); });

  return {
    field,
    rows: host.querySelectorAll(".math-input__field").length,
    dividers: host.querySelectorAll(".math-input__toolbar-divider").length,
    type: (character) => input("insertText", character),
    remove: () => input("deleteContentBackward", null),
    press: (key) => record(() => { field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); }),
    focus: () => { focused = field; },
    unmount: () => {
      act(() => root.unmount());
      host.remove();
      if (focused === field) focused = null;
    },
  };
}

/** The layout reads one keystroke costs, taken as the worst of a short run so a one-off cannot flatter it. */
export function measureKeystroke(fixture: Fixture, keystrokes = "xyz"): LayoutReport & { rows: number; dividers: number } {
  const editor = mountEditor(fixture);
  try {
    const reports = [...keystrokes].map((character) => editor.type(character));
    const worst = reports.reduce((most, report) => (report.reads > most.reads ? report : most));
    return { ...worst, rows: editor.rows, dividers: editor.dividers };
  } finally {
    editor.unmount();
  }
}

import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

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

type Template = "root" | "fraction" | "power";
type Row = { id: string; text: string };
type EditorIconName = "root" | "fraction" | "power" | "newLine" | "remove";

function EditorIcon({ name }: { name: EditorIconName }) {
  const shape = {
    root: <><path d="m3 13 3.3 5L11 4" /><path d="M10.6 7H21" /></>,
    fraction: <><circle cx="12" cy="6.5" r="1" fill="currentColor" stroke="none" /><path d="M5 12h14" /><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none" /></>,
    power: <><path d="m4.5 17 6-8" /><path d="m4.5 9 6 8" /><path d="M15 7.5c.5-1.1 1.5-1.7 2.7-1.7 1.5 0 2.5.8 2.5 2 0 1-.7 1.7-2.3 2.6L15 12h5" /></>,
    newLine: <><path d="M6 4v10" /><path d="m3 11 3 3 3-3" /><path d="M11 7h8v12H7" /><path d="M11 15h8" /></>,
    remove: <><path d="M5 7h14" /><path d="M9 7V5h6v2" /><path d="m8 7 1 12h6l1-12" /><path d="M10.5 10.5v5" /><path d="M13.5 10.5v5" /></>,
  }[name];

  return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>;
}

const escapeHtml = (text: string) => text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!);
const initialMarkup = (line: string) => escapeHtml(line)
  .replace(/\\sqrt\{([^}]*)\}/g, '<span class="inline-flex shrink-0 items-start align-middle mx-[.08em]" data-math="root"><span class="inline-block -mr-[.18em] min-h-[1.35em] w-[.9em] font-serif text-[1.65em]/[.82]" data-radical="true" contenteditable="false" aria-hidden="true">√</span><span class="inline-block min-h-[1.35em] min-w-[1.2em] border-t-[1.5px] border-current px-[.16em] pl-[.2em] pt-[.02em] outline-none empty:after:inline-block empty:after:w-[.5em] empty:after:border-b empty:after:border-dotted empty:after:border-slate-400 focus:bg-orange-100 focus:outline focus:outline-1 focus:outline-amber-600" data-slot="root">$1</span></span>')
  .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '<span class="inline-flex shrink-0 flex-col justify-center align-middle mx-[.17em] -translate-y-[.04em] text-center leading-none" data-math="fraction"><span class="inline-block min-h-[1.15em] min-w-[1.1em] border-b-[1.5px] border-current px-[.28em] pb-[.08em] outline-none empty:after:inline-block empty:after:w-[.5em] empty:after:border-b empty:after:border-dotted empty:after:border-slate-400 focus:bg-orange-100 focus:outline focus:outline-1 focus:outline-amber-600" data-slot="numerator">$1</span><span class="inline-block min-h-[1.15em] min-w-[1.1em] px-[.28em] pt-[.08em] outline-none empty:after:inline-block empty:after:w-[.5em] empty:after:border-b empty:after:border-dotted empty:after:border-slate-400 focus:bg-orange-100 focus:outline focus:outline-1 focus:outline-amber-600" data-slot="denominator">$2</span></span>')
  .replace(/\^\{([^}]*)\}/g, '<span class="inline-flex shrink-0 align-super mx-[.08em] text-[.72em]" data-math="power"><span class="inline-block min-h-[1.15em] min-w-[1.1em] outline-none empty:after:inline-block empty:after:w-[.5em] empty:after:border-b empty:after:border-dotted empty:after:border-slate-400 focus:bg-orange-100 focus:outline focus:outline-1 focus:outline-amber-600" data-slot="power">$1</span></span>');

const makeTemplate = (kind: Template) => {
  const node = document.createElement("span");
  node.className = kind === "fraction" ? "inline-flex shrink-0 flex-col justify-center align-middle mx-[.17em] -translate-y-[.04em] text-center leading-none" : kind === "power" ? "inline-flex shrink-0 align-super mx-[.08em] text-[.72em]" : "inline-flex shrink-0 items-start align-middle mx-[.08em]";
  node.dataset.math = kind;
  if (kind === "root") node.innerHTML = '<span class="inline-block -mr-[.18em] min-h-[1.35em] w-[.9em] font-serif text-[1.65em]/[.82]" data-radical="true" contenteditable="false" aria-hidden="true">√</span><span class="inline-block min-h-[1.35em] min-w-[1.2em] border-t-[1.5px] border-current px-[.16em] pl-[.2em] pt-[.02em] outline-none empty:after:inline-block empty:after:w-[.5em] empty:after:border-b empty:after:border-dotted empty:after:border-slate-400 focus:bg-orange-100 focus:outline focus:outline-1 focus:outline-amber-600" data-slot="root"></span>';
  if (kind === "fraction") node.innerHTML = '<span class="inline-block min-h-[1.15em] min-w-[1.1em] border-b-[1.5px] border-current px-[.28em] pb-[.08em] outline-none empty:after:inline-block empty:after:w-[.5em] empty:after:border-b empty:after:border-dotted empty:after:border-slate-400 focus:bg-orange-100 focus:outline focus:outline-1 focus:outline-amber-600" data-slot="numerator"></span><span class="inline-block min-h-[1.15em] min-w-[1.1em] px-[.28em] pt-[.08em] outline-none empty:after:inline-block empty:after:w-[.5em] empty:after:border-b empty:after:border-dotted empty:after:border-slate-400 focus:bg-orange-100 focus:outline focus:outline-1 focus:outline-amber-600" data-slot="denominator"></span>';
  if (kind === "power") node.innerHTML = '<span class="inline-block min-h-[1.15em] min-w-[1.1em] outline-none empty:after:inline-block empty:after:w-[.5em] empty:after:border-b empty:after:border-dotted empty:after:border-slate-400 focus:bg-orange-100 focus:outline focus:outline-1 focus:outline-amber-600" data-slot="power"></span>';
  return node;
};

const latexFrom = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const slot = (name: string) => {
    const target = node.querySelector(`[data-slot="${name}"]`);
    return target ? Array.from(target.childNodes).map(latexFrom).join("") : "";
  };
  if (node.dataset.math === "root") return `\\sqrt{${slot("root")}}`;
  if (node.dataset.math === "fraction") return `\\frac{${slot("numerator")}}{${slot("denominator")}}`;
  if (node.dataset.math === "power") return `^{${slot("power")}}`;
  return Array.from(node.childNodes).map(latexFrom).join("");
};

const selectionSlot = () => {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const nodes = [selection.focusNode, selection.anchorNode, selection.getRangeAt(0).commonAncestorContainer];
  for (const node of nodes) {
    const element = node instanceof HTMLElement ? node : node?.parentElement;
    const slot = element?.closest<HTMLElement>("[data-slot]");
    if (slot) return slot;
  }
  return null;
};

const directSlots = (math: HTMLElement) => Array.from(math.children).filter((child): child is HTMLElement => child instanceof HTMLElement && Boolean(child.dataset.slot));

/** A dependency-free, visual formula editor that emits LaTeX-compatible text. */
export function MathInput({ value, defaultValue = "", onChange, placeholder = "Write a formula…", disabled = false, className = "", style, "aria-label": ariaLabel = "Math editor" }: MathInputProps) {
  const toRows = (latex: string): Row[] => latex.split("\n").map((text) => ({ id: crypto.randomUUID(), text }));
  const [rows, setRows] = useState<Row[]>(() => toRows(value ?? defaultValue));
  const [rawValue, setRawValue] = useState(value ?? defaultValue);
  const fields = useRef(new Map<string, HTMLDivElement>());
  const activeRow = useRef<string | null>(null);
  const activeSlot = useRef<HTMLElement | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [keyboardLog, setKeyboardLog] = useState<string[]>([]);
  const focusAfterAdd = useRef<string | null>(null);
  const lastExternal = useRef(value);
  const labelId = useId();

  useEffect(() => {
    if (value === undefined || value === lastExternal.current) return;
    lastExternal.current = value;
    setRawValue(value);
    setRows(toRows(value));
  }, [value]);

  useEffect(() => {
    const id = focusAfterAdd.current;
    const field = id ? fields.current.get(id) : undefined;
    if (field) { focusAfterAdd.current = null; placeAtEnd(field); }
  }, [rows]);

  const publishRows = (nextRows: Row[]) => {
    const next = nextRows.map(({ id, text }) => {
      const field = fields.current.get(id);
      return field ? Array.from(field.childNodes).map(latexFrom).join("") : text;
    }).join("\n");
    lastExternal.current = next;
    setRawValue(next);
    onChange?.(next);
  };

  const publish = () => publishRows(rows);

  const currentField = () => fields.current.get(activeRow.current ?? rows[0]?.id);
  const insert = (kind: Template) => {
    const field = currentField();
    if (!field || disabled) return;
    field.focus();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const node = makeTemplate(kind);
    if (range && field.contains(range.commonAncestorContainer)) { range.deleteContents(); range.insertNode(node); } else field.append(node);
    const slot = node.querySelector<HTMLElement>("[data-slot]")!;
    activeSlot.current = slot;
    placeAtEnd(slot);
    publish();
  };

  const insertFractionFromPreviousTerm = () => {
    const field = currentField();
    if (!field || disabled) return;
    field.focus();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const focus = selection?.focusNode;
    const slot = selectionSlot();
    const editableRoot = slot ?? field;
    const textNode = focus?.nodeType === Node.TEXT_NODE
      ? focus
      : focus === editableRoot
        ? editableRoot.childNodes[selection?.focusOffset ? selection.focusOffset - 1 : -1]
        : null;
    const caretOffset = focus?.nodeType === Node.TEXT_NODE ? selection?.focusOffset ?? 0 : textNode?.textContent?.length ?? 0;

    if (range?.collapsed && selection && textNode?.nodeType === Node.TEXT_NODE && field.contains(textNode)) {
      const text = textNode.textContent ?? "";
      let termText = text.slice(0, caretOffset);
      let termStartNode = textNode;
      if (/^[A-Za-z0-9.,]+$/.test(termText)) {
        let sibling = textNode.previousSibling;
        while (sibling?.nodeType === Node.TEXT_NODE && /^[A-Za-z0-9.,]+$/.test(sibling.textContent ?? "")) {
          termText = `${sibling.textContent}${termText}`;
          termStartNode = sibling;
          sibling = sibling.previousSibling;
        }
      }
      const previousTerm = termText.match(/[A-Za-z0-9.,]+$/)?.[0];
      if (previousTerm) {
        const fraction = makeTemplate("fraction");
        const numerator = fraction.querySelector<HTMLElement>('[data-slot="numerator"]')!;
        const denominator = fraction.querySelector<HTMLElement>('[data-slot="denominator"]')!;
        const replaceRange = document.createRange();
        replaceRange.setStart(termStartNode, previousTerm === termText ? 0 : caretOffset - previousTerm.length);
        replaceRange.setEnd(textNode, caretOffset);
        replaceRange.deleteContents();
        replaceRange.insertNode(fraction);
        numerator.textContent = previousTerm;
        activeSlot.current = denominator;
        placeAtEnd(denominator);
        publish();
        return;
      }
    }

    insert("fraction");
  };

  const advanceFromSlot = (slot: HTMLElement) => {
    const math = slot.closest<HTMLElement>("[data-math]");
    if (!math) return;
    const denominator = directSlots(math).find((candidate) => candidate.dataset.slot === "denominator");
    if (slot.dataset.slot === "numerator" && denominator) {
      activeSlot.current = denominator;
      placeAtEnd(denominator);
      return;
    }
    activeSlot.current = null;
    placeAfter(math);
  };

  const retreatFromSlot = (slot: HTMLElement) => {
    const math = slot.closest<HTMLElement>("[data-math]");
    if (!math) return;
    const numerator = directSlots(math).find((candidate) => candidate.dataset.slot === "numerator");
    if (slot.dataset.slot === "denominator" && numerator) {
      activeSlot.current = numerator;
      placeAtEnd(numerator);
      return;
    }
    activeSlot.current = null;
    placeBefore(math);
  };

  const enterFormula = (math: HTMLElement, direction: "first" | "last") => {
    const slots = directSlots(math);
    const slot = direction === "first" ? slots[0] : slots[slots.length - 1];
    if (!slot) return;
    activeSlot.current = slot;
    if (direction === "first") placeAtStart(slot); else placeAtEnd(slot);
  };

  const createRow = () => {
    const nextId = crypto.randomUUID();
    focusAfterAdd.current = nextId;
    const next = [...rows, { id: nextId, text: "" }];
    setRows(next);
    publishRows(next);
  };

  const removeRow = (id: string) => {
    if (rows.length < 2) return;
    const index = rows.findIndex((row) => row.id === id);
    const next = rows.filter((row) => row.id !== id);
    const nextFocus = next[Math.min(index, next.length - 1)].id;
    activeRow.current = nextFocus;
    setActiveRowId(nextFocus);
    focusAfterAdd.current = nextFocus;
    setRows(next);
    publishRows(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    activeRow.current = id;
    activeSlot.current = selectionSlot();
    if (event.key === "/") {
      event.preventDefault();
      insertFractionFromPreviousTerm();
      return;
    }
    if (event.key === "End") { event.preventDefault(); placeAtEnd(event.currentTarget); return; }
    if (event.key === "ArrowRight") {
      const slot = selectionSlot();
      if (slot && caretAtEnd(slot)) { event.preventDefault(); advanceFromSlot(slot); return; }
      const nextMath = adjacentMath("after");
      if (nextMath) { event.preventDefault(); enterFormula(nextMath, "first"); return; }
    }
    if (event.key === "ArrowLeft") {
      const slot = selectionSlot();
      if (slot && caretAtStart(slot)) { event.preventDefault(); retreatFromSlot(slot); return; }
      const previousMath = adjacentMath("before");
      if (previousMath) { event.preventDefault(); enterFormula(previousMath, "last"); return; }
    }
    if (event.key === "=") {
      const slot = selectionSlot();
      if (slot) {
        event.preventDefault();
        const math = slot.closest<HTMLElement>("[data-math]");
        if (math) {
          placeAfter(math);
          insertText("=");
          activeSlot.current = null;
          publish();
          return;
        }
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      createRow();
    }
  };

  const buttonClass = "inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 border-slate-200 bg-white text-[#506887] hover:border-[#9db2cc] hover:bg-slate-50 hover:text-[#2f4c70] focus-visible:outline-3 focus-visible:outline-[#b7c9df] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45";
  return <div className={`w-full max-w-3xl text-[#263956] font-mono ${className}`.trim()} style={style} onKeyDownCapture={(event) => setKeyboardLog((keys) => [...keys, event.key])}>
    <div className="overflow-hidden rounded-2xl border-2 border-[#647895] bg-white" aria-labelledby={labelId}>
      <span id={labelId} className="sr-only">{ariaLabel}</span>
      {rows.map((row, index) => <div className="relative min-h-15 border-t border-slate-200 first:border-t-0" key={row.id}>
        {activeRowId === row.id && <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-slate-50 p-3" role="toolbar" aria-label={`Formula tools for row ${index + 1}`}>
          <button type="button" className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => insert("root")} disabled={disabled} aria-label="Insert square root" title="Square root"><EditorIcon name="root" /></button>
          <button type="button" className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => insert("fraction")} disabled={disabled} aria-label="Insert fraction" title="Divide"><EditorIcon name="fraction" /></button>
          <button type="button" className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => insert("power")} disabled={disabled} aria-label="Insert power" title="Power"><EditorIcon name="power" /></button>
          <span className="hidden text-sm font-medium tracking-tight text-[#8ba0bd] sm:inline">Formula tools</span>
          {rows.length > 1 && <button type="button" className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-3 focus-visible:outline-slate-300 focus-visible:outline-offset-2" onMouseDown={(event) => event.preventDefault()} onClick={() => removeRow(row.id)} aria-label="Remove formula row" title="Remove"><EditorIcon name="remove" /></button>}
        </div>}
        <div ref={(element) => { if (element) fields.current.set(row.id, element); else fields.current.delete(row.id); }} className="math-input__field min-h-15 overflow-x-auto p-3.5 font-serif text-xl leading-relaxed font-medium whitespace-nowrap outline-none caret-[#4d6f9a] empty:before:pointer-events-none empty:before:text-[1.15rem] empty:before:font-medium empty:before:font-sans empty:before:text-[#8ba0bd] empty:before:content-[attr(data-placeholder)] focus:bg-slate-50 focus:shadow-[inset_3px_0_0_#4d6f9a]" contentEditable={!disabled} suppressContentEditableWarning spellCheck={false} role="textbox" aria-multiline="false" aria-label={`${ariaLabel}, row ${index + 1}`} data-placeholder={index === 0 ? placeholder : "New formula…"} dangerouslySetInnerHTML={{ __html: initialMarkup(row.text) }} onFocus={() => { activeRow.current = row.id; setActiveRowId(row.id); activeSlot.current = selectionSlot(); }} onInput={() => { activeSlot.current = selectionSlot(); publish(); }} onKeyDown={(event) => onKeyDown(event, row.id)} onKeyUp={() => { activeSlot.current = selectionSlot(); }} onClick={(event) => { const target = event.target as HTMLElement; const radical = target.closest("[data-radical='true']"); if (radical) { const slot = radical.parentElement!.querySelector<HTMLElement>("[data-slot]")!; activeSlot.current = slot; placeAtEnd(slot); return; } const math = target.closest<HTMLElement>("[data-math]"); if (math && event.clientX >= math.getBoundingClientRect().right - 8) { activeSlot.current = null; placeAfter(math); return; } if (target === event.currentTarget) { activeSlot.current = null; placeAtEnd(event.currentTarget); } }} />
        {activeRowId === row.id && <button type="button" className="absolute right-3 bottom-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-slate-200 bg-white text-[#426487] hover:border-[#9db2cc] hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-[#b7c9df] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45" onMouseDown={(event) => event.preventDefault()} onClick={createRow} disabled={disabled} aria-label="Add new formula row" title="New line"><EditorIcon name="newLine" /></button>}
      </div>)}
    </div>
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Raw value">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-600">Raw value</h2>
        <span className="text-xs text-slate-400">KaTeX source</span>
      </div>
      <pre className="mt-2 max-h-36 overflow-auto rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-[#526b8a]"><code>{rawValue || "The KaTeX value will appear as you type."}</code></pre>
    </section>
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Keyboard log" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-600">Keyboard log</h2>
        <span className="text-xs text-slate-400">{keyboardLog.length} keys</span>
      </div>
      <div className="mt-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
        {keyboardLog.length > 0 ? keyboardLog.map((key, index) => <kbd key={`${key}-${index}`} className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-medium text-[#526b8a] shadow-sm">{formatKey(key)}</kbd>) : <p className="text-xs text-slate-400">Keys pressed in this editor will appear here.</p>}
      </div>
    </section>
    <p className="mt-3 text-xs leading-snug font-medium text-[#8ba0bd]">Press <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[#526b8a]">Enter</kbd> or use the row action to expand · <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[#526b8a]">←</kbd> <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[#526b8a]">→</kbd> moves through a formula · click to its right or press <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[#526b8a]">End</kbd> to continue after it</p>
  </div>;
}

function placeAtEnd(element: HTMLElement) { const range = document.createRange(); range.selectNodeContents(element); range.collapse(false); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); element.focus(); }
function placeAtStart(element: HTMLElement) { const range = document.createRange(); range.selectNodeContents(element); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); element.focus(); }
function placeBefore(element: HTMLElement) { const range = document.createRange(); range.setStartBefore(element); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); element.closest<HTMLElement>(".math-input__field")?.focus(); }
function placeAfter(element: HTMLElement) { const range = document.createRange(); range.setStartAfter(element); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); element.closest<HTMLElement>(".math-input__field")?.focus(); }
function insertText(text: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
function formatKey(key: string) { return key === "ArrowRight" ? "Right" : key === " " ? "Space" : key; }
function adjacentMath(direction: "before" | "after") {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;
  const focus = selection.focusNode;
  if (!focus) return null;
  const offset = selection.focusOffset;
  const candidate = focus.nodeType === Node.TEXT_NODE
    ? direction === "before" && offset === 0 ? focus.previousSibling : direction === "after" && offset === (focus.textContent?.length ?? 0) ? focus.nextSibling : null
    : direction === "before" ? focus.childNodes[offset - 1] : focus.childNodes[offset];
  return candidate instanceof HTMLElement && candidate.dataset.math ? candidate : null;
}
function caretAtBoundary(element: HTMLElement, boundary: "start" | "end") {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const caret = selection.getRangeAt(0);
  if (!(element.contains(caret.startContainer) || caret.startContainer === element)) return false;
  const end = document.createRange();
  end.selectNodeContents(element);
  end.collapse(boundary === "start");
  return caret.compareBoundaryPoints(boundary === "start" ? Range.START_TO_START : Range.END_TO_END, end) === 0;
}
function caretAtStart(element: HTMLElement) { return caretAtBoundary(element, "start"); }
function caretAtEnd(element: HTMLElement) { return caretAtBoundary(element, "end"); }

export default MathInput;

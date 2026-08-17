// @vitest-environment jsdom
import { type ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { type CaretPosition, type FormulaNode } from "./model";
import { parseLatex } from "./parse";
import { CARET_PLACEHOLDER, renderNodes } from "./render";
import { applySelection, caretScrollOffset, positionFromDom, positionFromPoint, repairField, selectionFromDom } from "./selection";

/**
 * The DOM bridge, which had no tests at all.
 *
 * It is the seam the whole editor rests on and the one place a mistake is invisible from
 * either side: the model is right, the rendering is right, and the caret still lands
 * somewhere nobody asked for. It is also what every milestone after this one has to move —
 * tokenised runs split a run into several spans, and every assumption below is about how a
 * run maps to an element and an offset into it.
 *
 * The fields here are rendered by `render.tsx` from trees parsed by `parse.ts`, never built
 * by hand, because the contract under test is precisely that those two agree about
 * `data-path`. A hand-written fixture would let them drift and still pass.
 *
 * jsdom lays nothing out, so where geometry is the subject it is stated: `rect()` gives an
 * element a box and `caretAt()` stands in for the browser's own hit-testing. Everything else
 * needs no geometry at all, which is itself the point — the bridge reads addresses, not
 * positions.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const boxes = new WeakMap<Element, DOMRect>();
const ZERO = new DOMRect();
Element.prototype.getBoundingClientRect = function (): DOMRect { return boxes.get(this) ?? ZERO; };
const rect = (element: Element, left: number, width: number, top = 0, height = 20): void => { boxes.set(element, new DOMRect(left, top, width, height)); };

let unmount: (() => void) | null = null;
afterEach(() => { act(() => unmount?.()); unmount = null; window.getSelection()?.removeAllRanges(); });

/** A field holding a parsed formula, rendered by the renderer that stamps the addresses. */
function mount(latex: string): { field: HTMLElement; content: FormulaNode[] } {
  const field = document.createElement("div");
  field.className = "math-input__field";
  document.body.append(field);
  const content = parseLatex(latex);
  const root = createRoot(field);
  act(() => root.render(renderNodes(content) as ReactNode));
  unmount = () => { root.unmount(); field.remove(); };
  return { field, content };
}

const at = (field: HTMLElement, path: string): HTMLElement => {
  const element = field.querySelector<HTMLElement>(`[data-path="${path}"]`);
  if (!element) throw new Error(`no element at ${path}; the field holds ${[...field.querySelectorAll("[data-path]")].map((node) => node.getAttribute("data-path")).join(", ")}`);
  return element;
};

/**
 * A position written the way the renderer addresses it, so an expectation reads as an
 * address rather than as a nest of path steps. Deliberately not `decodePath`: an expectation
 * built by the function under test agrees with it by construction.
 */
const parsePath = (path: string): CaretPosition["path"] =>
  path.split("/").map((step) => {
    const [index, branch] = step.split(".");
    return branch ? { index: Number(index), branch: branch as never } : { index: Number(index) };
  });
const there = (path: string, offset: number): CaretPosition => ({ path: parsePath(path), offset });

/** Stands in for the browser's caret hit-testing, which jsdom does not implement at all. */
const caretAt = (node: Node, offset: number): void => {
  (document as unknown as { caretRangeFromPoint: () => Range }).caretRangeFromPoint = () => {
    const range = document.createRange();
    range.setStart(node, offset);
    return range;
  };
};
const noCaretHitTesting = (): void => { delete (document as unknown as { caretRangeFromPoint?: unknown }).caretRangeFromPoint; };

describe("reading a position back out of the DOM", () => {
  it("takes the run the offset is inside, and clamps to its length", () => {
    const { field } = mount("abc");
    const run = at(field, "0");
    expect(run.childNodes).toHaveLength(1); // nothing to space, so one text node
    expect(positionFromDom(field, run.firstChild!, 2)).toEqual(there("0", 2));
    // A native selection can name an offset past the text the model has, and does after an
    // IME has been writing into the element; the model's length wins.
    expect(positionFromDom(field, run.firstChild!, 99)).toEqual(there("0", 3));
  });

  it("counts a blank run as empty, however wide the placeholder it draws is", () => {
    const { field } = mount("");
    const run = at(field, "0");
    // The zero-width placeholder is a character in the DOM and no part of the model.
    expect(run.textContent).toBe(CARET_PLACEHOLDER);
    expect(positionFromDom(field, run.firstChild!, 1)).toEqual(there("0", 0));
  });

  it("takes the run after the offset when it lands on a formula rather than in a run", () => {
    const { field } = mount("\\frac{1}{2}");
    // Offset 0 of the fraction names the numerator, which is the first thing inside it.
    expect(positionFromDom(field, at(field, "1"), 0)).toEqual(there("1.numerator/0", 0));
  });

  it("takes the end of the run before the offset when there is nothing after it", () => {
    const { field } = mount("\\frac{1}{2}");
    // Past the last child: the run before it, at its end.
    expect(positionFromDom(field, at(field, "1"), 2)).toEqual(there("1.denominator/0", 1));
  });

  it("falls back to the first run inside whatever it landed on", () => {
    const { field } = mount("(x)");
    // A bracket is a drawn `svg` with no address of its own and no run anywhere inside it,
    // so neither side of the offset names one and the enclosing group answers instead.
    const paren = field.querySelector<HTMLElement>(".math-input__paren")!;
    expect(positionFromDom(field, paren, 0)).toEqual(there("1.content/0", 0));
  });

  it("refuses a node that is not in the field", () => {
    const { field } = mount("1");
    const stranger = document.createElement("span");
    expect(positionFromDom(field, stranger, 0)).toBeNull();
    expect(positionFromDom(field, null, 0)).toBeNull();
  });

  it("reads the field itself, preferring the run the offset points forwards at", () => {
    const { field } = mount("\\frac{1}{2}");
    // Between the leading run and the fraction: the fraction's first run is what comes next.
    expect(positionFromDom(field, field, 1)).toEqual(there("1.numerator/0", 0));
  });

  it("reads a whole native selection, or nothing when there is none", () => {
    const { field } = mount("abc");
    expect(selectionFromDom(field)).toBeNull();
    const run = at(field, "0").firstChild!;
    window.getSelection()!.setBaseAndExtent(run, 1, run, 3);
    expect(selectionFromDom(field)).toEqual({ anchor: there("0", 1), focus: there("0", 3) });
  });
});

/**
 * The bridge's one real assumption used to be that a run is a single text node, and
 * typography breaks it: an operation is set with space around it, which means a span around
 * the operator and a run spread across three nodes. Everything here is about that seam.
 */
describe("a run split either side of an operation", () => {
  const nodesOf = (run: HTMLElement) => [...run.childNodes].map((child) => (child.nodeType === Node.TEXT_NODE ? child.textContent : `<${(child as HTMLElement).className.replace("math-input__token ", "")}>${child.textContent}</>`));

  it("splits the run without changing its text or its address", () => {
    const { field } = mount("1+2");
    const run = at(field, "0");
    expect(nodesOf(run)).toEqual(["1", "<math-input__token--operator>+</>", "2"]);
    // The run is still the addressed element; the spans inside carry no address of their own.
    expect(run.querySelectorAll("[data-path]")).toHaveLength(0);
    expect(run.textContent).toBe("1+2");
  });

  it("sets a relation apart from an operator, so each can be spaced its own amount", () => {
    const { field } = mount("x=1");
    expect(nodesOf(at(field, "0"))).toEqual(["x", "<math-input__token--relation>=</>", "1"]);
  });

  it("leaves a sign that is not an operation alone", () => {
    // `-b` is a negative, not a subtraction: nothing precedes it, so it takes no space.
    expect(nodesOf(at(mount("-b").field, "0"))).toEqual(["-b"]);
    // Nor does the second of two signs: the minus of `2⋅-3` belongs to the 3.
    expect(nodesOf(at(mount("2*-3").field, "0"))).toEqual(["2", "<math-input__token--operator>⋅</>", "-3"]);
  });

  it("does treat a sign after a formula as an operation", () => {
    // By the alternation invariant, a run after the first has a construct in front of it —
    // which is a term, so this minus really is a subtraction.
    const { field } = mount("\\frac{1}{2}-3");
    expect(nodesOf(at(field, "2"))).toEqual(["<math-input__token--operator>-</>", "3"]);
  });

  it("carries the caret to and from every offset in a split run", () => {
    const { field } = mount("1+2");
    for (const offset of [0, 1, 2, 3]) {
      applySelection(field, { anchor: there("0", offset), focus: there("0", offset) });
      // Read back through the DOM the browser now holds, which is the round trip that
      // matters: a caret that cannot be read back is a caret that jumps on the next render.
      expect(selectionFromDom(field), `offset ${offset}`).toEqual({ anchor: there("0", offset), focus: there("0", offset) });
    }
  });

  it("reads a position off the operator's own span", () => {
    const { field } = mount("1+2");
    const operator = at(field, "0").querySelector<HTMLElement>(".math-input__token--operator")!;
    // Inside the operator's text: one character in, which is two into the run.
    expect(positionFromDom(field, operator.firstChild!, 1)).toEqual(there("0", 2));
    // On the span itself, before and after its only child.
    expect(positionFromDom(field, operator, 0)).toEqual(there("0", 1));
    expect(positionFromDom(field, operator, 1)).toEqual(there("0", 2));
  });

  it("reads a position off the run element, counting the text of the children before it", () => {
    const { field } = mount("1+2");
    const run = at(field, "0");
    expect(positionFromDom(field, run, 0)).toEqual(there("0", 0));
    expect(positionFromDom(field, run, 1)).toEqual(there("0", 1));
    expect(positionFromDom(field, run, 2)).toEqual(there("0", 2));
    expect(positionFromDom(field, run, 3)).toEqual(there("0", 3));
  });

  it("puts a split run back in the shape the renderer gave it", () => {
    const { field, content } = mount("1+2");
    const run = at(field, "0");
    // What an IME does: writes over the whole run, spans and all.
    run.textContent = "1+2ちょ";
    expect(nodesOf(run)).toEqual(["1+2ちょ"]);
    repairField(field, content);
    // Not merely the right text — the right structure, because React is about to diff
    // against its own last description of this run rather than against the document.
    expect(nodesOf(run)).toEqual(["1", "<math-input__token--operator>+</>", "2"]);
    expect(selectionFromDom(field)).toBeNull();
    applySelection(field, { anchor: there("0", 3), focus: there("0", 3) });
    expect(selectionFromDom(field)).toEqual({ anchor: there("0", 3), focus: there("0", 3) });
  });
});

describe("writing a position into the DOM", () => {
  it("moves the selection, and says so only when something actually moved", () => {
    const { field } = mount("1+2");
    const range = { anchor: there("0", 1), focus: there("0", 1) };
    expect(applySelection(field, range)).toBe(true);
    expect(window.getSelection()!.anchorOffset).toBe(1);
    // The caret pass runs after every render and leans on this being a no-op when the DOM
    // already agrees: it is what stops a re-render costing a scroll measurement.
    expect(applySelection(field, range)).toBe(false);
  });

  it("puts a blank run's caret at the placeholder rather than after it", () => {
    const { field } = mount("");
    expect(applySelection(field, { anchor: there("0", 0), focus: there("0", 0) })).toBe(true);
    expect(window.getSelection()!.anchorOffset).toBe(0);
  });
});

describe("hit-testing a click", () => {
  it("carries on after a formula when the click fell past its edge", () => {
    const { field } = mount("\\frac{1}{2}");
    const fraction = at(field, "1");
    rect(fraction, 100, 40);
    // The browser puts the caret in the denominator, because a fraction's slots reach its
    // edge — but the click was to the right of the whole fraction, which means "after it".
    caretAt(at(field, "1.denominator/0").firstChild!, 1);
    expect(positionFromPoint(field, 200, 10)).toEqual(there("2", 0));
  });

  it("carries on before a formula when the click fell short of it", () => {
    const { field } = mount("\\frac{1}{2}");
    rect(at(field, "1"), 100, 40);
    caretAt(at(field, "1.numerator/0").firstChild!, 0);
    expect(positionFromPoint(field, 20, 10)).toEqual(there("0", 0));
  });

  it("leaves a click inside a formula where the browser put it", () => {
    const { field } = mount("\\frac{1}{2}");
    rect(at(field, "1"), 100, 40);
    caretAt(at(field, "1.numerator/0").firstChild!, 1);
    expect(positionFromPoint(field, 120, 10)).toEqual(there("1.numerator/0", 1));
  });

  it("finds the nearest run when the click hit no text at all", () => {
    const { field } = mount("1+\\frac{2}{3}");
    noCaretHitTesting();
    rect(at(field, "0"), 0, 30);
    rect(at(field, "1.numerator/0"), 40, 20, 0, 10);
    rect(at(field, "1.denominator/0"), 40, 20, 30, 10);
    rect(at(field, "2"), 70, 10);
    // Below the fraction and level with its denominator: that run is the closest box.
    expect(positionFromPoint(field, 45, 34)).toEqual(there("1.denominator/0", 0));
    // Past the middle of a run's box means the far end of it, the way a click on text does.
    expect(positionFromPoint(field, 28, 5)).toEqual(there("0", 2));
  });
});

describe("scrolling the caret into view", () => {
  const withCaret = (field: HTMLElement, caret: DOMRect) => {
    const run = field.querySelector<HTMLElement>(".math-input__text")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(run, 0, run, 0);
    Range.prototype.getBoundingClientRect = function (): DOMRect { return caret; };
    return field;
  };

  it("asks for nothing when the caret is comfortably inside", () => {
    const { field } = mount("1+2");
    rect(field, 0, 800);
    expect(caretScrollOffset(withCaret(field, new DOMRect(100, 0, 2, 20)))).toBe(0);
  });

  it("asks to scroll on when the caret is under the right-hand controls", () => {
    const { field } = mount("1+2");
    rect(field, 0, 800);
    // 56px of the right-hand edge is the new-row button and the fade-out mask.
    expect(caretScrollOffset(withCaret(field, new DOMRect(790, 0, 2, 20)))).toBe(48);
  });

  it("asks to scroll back when the caret is off the left-hand edge", () => {
    const { field } = mount("1+2");
    rect(field, 0, 800);
    expect(caretScrollOffset(withCaret(field, new DOMRect(4, 0, 2, 20)))).toBe(-12);
  });

  it("asks for nothing when the caret has no box to speak of", () => {
    const { field } = mount("");
    rect(field, 0, 800);
    // A range in an element with no text has no geometry, and a field that scrolled to
    // nowhere on the strength of it would jump on every render.
    expect(caretScrollOffset(withCaret(field, new DOMRect()))).toBe(0);
  });
});

describe("putting the text back", () => {
  it("rewrites every run from the tree", () => {
    const { field, content } = mount("1+\\frac{2}{3}");
    // What an IME does: writes straight into the element, behind React's back.
    at(field, "0").textContent = "1+ちょ";
    at(field, "1.numerator/0").textContent = "";
    repairField(field, content);
    expect(at(field, "0").textContent).toBe("1+");
    expect(at(field, "1.numerator/0").textContent).toBe("2");
  });

  it("gives an emptied run its placeholder back rather than leaving it blank", () => {
    const { field, content } = mount("\\frac{}{3}");
    const numerator = at(field, "1.numerator/0");
    numerator.textContent = "typed";
    repairField(field, content);
    // An element with no text at all gives a range inside it no geometry, so an empty run
    // always holds the zero-width placeholder instead.
    expect(numerator.textContent).toBe(CARET_PLACEHOLDER);
  });

  it("leaves a run that already agrees with the tree untouched", () => {
    const { field, content } = mount("1+2");
    const run = at(field, "0");
    const before = run.firstChild;
    repairField(field, content);
    // The same text node, not a replacement: a rewritten one would drop the selection.
    expect(run.firstChild).toBe(before);
  });
});

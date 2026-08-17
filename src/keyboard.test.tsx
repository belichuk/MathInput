// @vitest-environment jsdom
import { type ReactElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MathInput } from "./MathInput";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: (() => void) | null = null;
afterEach(() => { act(() => unmount?.()); unmount = null; });

/** A mounted editor driven only by events of the kind a keyboard and an IME actually send. */
function editor(defaultValue = "") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let latex = defaultValue;
  act(() => root.render(<MathInput defaultValue={defaultValue} onChange={(value: string) => { latex = value; }} /> as ReactElement));
  unmount = () => { root.unmount(); host.remove(); };

  const field = host.querySelector<HTMLElement>(".math-input__field")!;
  // jsdom will not focus a `contenteditable`, and the caret pass does nothing unless the row it
  // is writing into is the focused one.
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => field });
  act(() => { field.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });

  return {
    field,
    latex: () => latex,
    type: (text: string) => act(() => {
      for (const character of text) field.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: character, bubbles: true, cancelable: true }));
    }),
    press: (key: string, shiftKey = false) => act(() => { field.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })); }),
    run: (path: string) => field.querySelector<HTMLElement>(`.math-input__text[data-path="${path}"]`)!,
  };
}

/**
 * The milestone's acceptance test, and it is the task the plan set rather than a reduction of it:
 * write `x = (1+√2)/3`, go back into the radicand and change it, then raise the whole thing to a
 * power — touching nothing but keys.
 *
 * It could not be written until `√` opened a root. Until then there was no keyboard path to one
 * at all, which is the gap the original review put at the top of its list, and a version of this
 * test without the root would have been the task with the hard part removed.
 */
it("writes and edits x = (1+√2)/3 from the keyboard alone", () => {
  const { type, press, latex } = editor();

  type("x=(1+√2");
  expect(latex()).toBe("x=\\left(1+\\sqrt{2}\\right)");

  // Space steps out of the root, `)` out of the brackets, and `/` takes the whole bracketed
  // group as a numerator.
  type(" )/3");
  expect(latex()).toBe("x=\\frac{\\left(1+\\sqrt{2}\\right)}{3}");

  // Back to the radicand: Tab walks numerator, then brackets, then the root inside them.
  press("Home");
  press("Tab");
  press("Tab");
  press("Tab");
  type("5");
  expect(latex()).toBe("x=\\frac{\\left(1+\\sqrt{25}\\right)}{3}");

  press("End");
  type("^n");
  expect(latex()).toBe("x=\\frac{\\left(1+\\sqrt{25}\\right)}{3}^{n}");
});

/**
 * Composition over a run that typography has split.
 *
 * The one seam of the tokenised-run work that nothing else covers, and the constraint it sits
 * under is binding: an IME is how a great many people type, and mobile parity is not optional.
 * While composing, the IME owns the element and writes into it directly — so the run it writes
 * over is one it may have flattened, and what puts it back has to put back the *shape* the
 * renderer would have given it, not merely the text.
 */
describe("an IME composing over a split run", () => {
  const shapeOf = (run: HTMLElement) => [...run.childNodes].map((node) => (node.nodeType === Node.TEXT_NODE ? node.textContent : `<${(node as HTMLElement).className.replace("math-input__token ", "")}>`));

  it("puts the run back in the renderer's shape, then applies what was composed", () => {
    const { field, run, latex, type } = editor("1+2");
    const before = shapeOf(run("0"));
    expect(before).toEqual(["<math-input__token--number>", "<math-input__token--operator>", "<math-input__token--number>"]);

    act(() => { field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); });
    // What an IME does: writes over the whole run, spans and all, behind React's back.
    run("0").textContent = "1+2ちょ";
    act(() => { field.dispatchEvent(new CompositionEvent("compositionend", { data: "ち", bubbles: true })); });

    // The composed text arrives as one ordinary insertion, and the run is drawn in the shape
    // its *new* text calls for — the operator still its own span, the composed character a
    // plain segment beside it.
    expect(latex()).toBe("1+2ち");
    expect(shapeOf(run("0"))).toEqual([...before, "ち"]);
    // Typing carries on afterwards, which is what would break if React were left addressing
    // spans that the repair had removed.
    type("3");
    expect(latex()).toBe("1+2ち3");
    // The composed character is not a digit, so it breaks the run and the `3` after it is a
    // number of its own — which is the classifier doing its job, not the repair failing.
    expect(shapeOf(run("0"))).toEqual([...before, "ち", "<math-input__token--number>"]);
  });

  it("leaves nothing behind when the composition is abandoned", () => {
    const { field, run, latex } = editor("1+2");
    act(() => { field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); });
    run("0").textContent = "1+2ち";
    act(() => { field.dispatchEvent(new CompositionEvent("compositionend", { data: "", bubbles: true })); });
    expect(latex()).toBe("1+2");
    expect(run("0").textContent).toBe("1+2");
  });
});

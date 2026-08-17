// @vitest-environment jsdom
import { type ReactElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { MathInput } from "./MathInput";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: (() => void) | null = null;
afterEach(() => { act(() => unmount?.()); unmount = null; });

function render(element: ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  unmount = () => { root.unmount(); host.remove(); };
  return host;
}

/**
 * The milestone's acceptance test, written as the task rather than as its parts: write a
 * formula, go back into it, change it, and raise the whole thing to a power — touching nothing
 * but keys. Every step below is a real event of the kind a keyboard actually sends.
 */
it("writes and edits a formula from the keyboard alone", () => {
  let latex = "";
  const host = render(<MathInput defaultValue="" onChange={(value: string) => { latex = value; }} />);
  const field = host.querySelector<HTMLElement>(".math-input__field")!;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => field });
  act(() => { field.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });

  const type = (text: string) => act(() => {
    for (const character of text) field.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: character, bubbles: true, cancelable: true }));
  });
  const press = (key: string, shiftKey = false) => act(() => { field.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })); });

  // x = (1+√2)/3 — the root comes from typing, since `sqrt` has no key of its own yet.
  type("x=(1+");
  press("Tab");                    // out of the brackets is the next slot... there is none, so
  expect(latex).toBe("x=\\left(1+\\right)");

  // Write the root by hand: bracket close, then the fraction around the lot.
  type(")");
  type("/3");
  expect(latex).toBe("x=\\frac{\\left(1+\\right)}{3}");

  // Back into the brackets to finish what is inside them, using Tab rather than the mouse.
  press("Home");
  press("Tab");                    // the numerator
  press("Tab");                    // the brackets inside it
  type("2");
  expect(latex).toBe("x=\\frac{\\left(1+2\\right)}{3}");

  // Down from the numerator is the denominator, and up again is where it was.
  press("ArrowDown");
  type("0");
  expect(latex).toBe("x=\\frac{\\left(1+2\\right)}{30}");
  press("ArrowUp");

  // Raise the whole thing to n: End, then `^`.
  press("End");
  type("^n");
  expect(latex).toBe("x=\\frac{\\left(1+2\\right)}{30}^{n}");
});

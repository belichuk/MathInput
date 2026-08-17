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

function render(element: ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  unmount = () => { root.unmount(); host.remove(); };
  return host;
}

/**
 * The toolbar pattern, which asks for one tab stop and the arrow keys inside it.
 *
 * This stopped being housekeeping the moment `Tab` began walking the slots of a formula:
 * leaving the last slot now lands in the toolbar, so eleven separate tab stops sit between one
 * row of a worksheet and the next.
 */
describe("the toolbar as one tab stop", () => {
  const toolbar = (host: HTMLElement) => host.querySelector<HTMLElement>(".math-input__toolbar")!;
  const buttons = (host: HTMLElement) => [...toolbar(host).querySelectorAll<HTMLButtonElement>("button")];
  const stops = (host: HTMLElement) => buttons(host).filter((button) => button.tabIndex === 0).map((button) => button.getAttribute("title"));
  const arrow = (host: HTMLElement, key: string) => act(() => { toolbar(host).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });

  it("offers exactly one tab stop, however many buttons it holds", () => {
    const host = render(<MathInput autoHideToolbar={false} />);
    expect(buttons(host).length).toBeGreaterThan(10);
    expect(stops(host)).toEqual(["Square root"]);
  });

  it("moves along the strip with the arrow keys, and wraps", () => {
    const host = render(<MathInput autoHideToolbar={false} />);
    arrow(host, "ArrowRight");
    expect(stops(host)).toEqual(["Cube root"]);
    arrow(host, "ArrowLeft");
    expect(stops(host)).toEqual(["Square root"]);
    // Wrapping backwards from the first lands on the last.
    arrow(host, "ArrowLeft");
    expect(stops(host)).toEqual(["Forward"]);
  });

  it("jumps to the ends with Home and End", () => {
    const host = render(<MathInput autoHideToolbar={false} />);
    arrow(host, "End");
    expect(stops(host)).toEqual(["Forward"]);
    arrow(host, "Home");
    expect(stops(host)).toEqual(["Square root"]);
  });

  it("moves focus with the tab stop, which is the other half of the pattern", () => {
    const host = render(<MathInput autoHideToolbar={false} />);
    arrow(host, "ArrowRight");
    expect(document.activeElement?.getAttribute("title")).toBe("Cube root");
  });
});

describe("what a screen reader is given", () => {
  it("keeps the caret's zero-width placeholder out of the accessibility tree", () => {
    const host = render(<MathInput defaultValue="\\frac{1}{}" />);
    const blank = [...host.querySelectorAll<HTMLElement>(".math-input__text[data-blank]")];
    expect(blank.length).toBeGreaterThan(0);
    // It is a character the caret needs and the reader has no use for: zero-width, unnameable,
    // and no part of what the field says.
    for (const run of blank) expect(run.getAttribute("aria-hidden")).toBe("true");
    // A run with text in it is of course not hidden.
    expect(host.querySelector<HTMLElement>('.math-input__text[data-path="1.numerator/0"]')?.getAttribute("aria-hidden")).toBeNull();
  });

  it("names every row and every control", () => {
    const host = render(<MathInput autoHideToolbar={false} defaultValue={"1\n2"} aria-label="Working" />);
    expect([...host.querySelectorAll(".math-input__field")].map((row) => row.getAttribute("aria-label")))
      .toEqual(["Working, row 1", "Working, row 2"]);
    for (const button of host.querySelectorAll(".math-input__toolbar button")) expect(button.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("a disabled editor", () => {
  it("can still be reached by keyboard, to be read and copied", () => {
    const host = render(<MathInput defaultValue="x^{2}" disabled />);
    const field = host.querySelector<HTMLElement>(".math-input__field")!;
    // Focusability otherwise comes from `contentEditable` alone, which a disabled row does not
    // have — so without an explicit stop the formula drops out of the tab order entirely.
    expect(field.tabIndex).toBe(0);
    expect(field.getAttribute("contenteditable")).toBe("false");
    expect(field.textContent).toContain("x");
  });
});

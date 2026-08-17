// @vitest-environment jsdom
import { type ReactElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MathInput } from "./MathInput";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: (() => void) | null = null;
afterEach(() => { act(() => mounted?.()); mounted = null; });

function render(element: ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  mounted = () => { root.unmount(); host.remove(); };
  return host;
}

/**
 * The slot under the caret, which is written onto the element by the caret pass rather than
 * rendered into it — so it is checked here on the document, where it actually lands.
 */
describe("the slot the caret is in", () => {
  const marked = (host: HTMLElement) => [...host.querySelectorAll("[data-caret-slot]")].map((slot) => slot.getAttribute("data-path"));

  it("is not marked when the caret is not in one", () => {
    const host = render(<MathInput autoHideToolbar={false} defaultValue="1+2" />);
    expect(marked(host)).toEqual([]);
  });

  it("is marked when a construct opens and the caret lands inside it", () => {
    const host = render(<MathInput autoHideToolbar={false} defaultValue="" />);
    const press = (title: string) => act(() => host.querySelector<HTMLButtonElement>(`.math-input__tool[title="${title}"]`)!.click());
    press("Fraction");
    // The tool opens a fraction at its numerator, and that is the slot now being written in.
    expect(marked(host)).toEqual(["1.numerator"]);
  });

  it("moves with the caret, and marks exactly one slot at a time", () => {
    const host = render(<MathInput autoHideToolbar={false} defaultValue="" />);
    const press = (title: string) => act(() => host.querySelector<HTMLButtonElement>(`.math-input__tool[title="${title}"]`)!.click());
    press("Fraction");
    expect(marked(host)).toEqual(["1.numerator"]);
    // Forward out of the numerator is into the denominator.
    press("Forward");
    expect(marked(host)).toEqual(["1.denominator"]);
    // And out of the fraction altogether leaves nothing marked.
    press("Forward");
    expect(marked(host)).toEqual([]);
  });
});

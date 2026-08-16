// @vitest-environment jsdom
import { type ReactElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { type MathInputProps, MathInput } from "./MathInput";

/** The two pieces of layout the editor asks for and jsdom has no notion of: its own width, and where the caret is on screen. */
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
 * The toolbar as a row wears it, read the way a user meets it: the names of its groups and
 * the labels on its buttons. Pinned rather than auto-hidden, since nothing here is focused.
 */
function drawToolbar(props: Partial<MathInputProps> = {}) {
  const host = render(<MathInput autoHideToolbar={false} {...props} />);
  const read = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];
  return {
    groups: read(".math-input__toolbar [role='group']").map((group) => group.getAttribute("aria-label")),
    buttons: read(".math-input__toolbar .math-input__tool").map((button) => button.getAttribute("title")),
    dividers: read(".math-input__toolbar-divider").length,
  };
}

describe("the toolbar", () => {
  it("offers formulas, operators and the caret, in that order", () => {
    const toolbar = drawToolbar();
    expect(toolbar.groups).toEqual(["Formulas", "Operators", "Move the caret"]);
    expect(toolbar.buttons).toEqual(["Square root", "Cube root", "Fraction", "Power", "Brackets", "Plus", "Minus", "Divide", "Multiply", "Back", "Forward"]);
  });

  it("draws a divider between the groups and nowhere else", () => {
    expect(drawToolbar().dividers).toBe(2);
    expect(drawToolbar({ showOperators: false }).dividers).toBe(1);
    expect(drawToolbar({ showOperators: false, showNavigation: false }).dividers).toBe(0);
  });

  it("drops the group a switch turns off and keeps the rest", () => {
    expect(drawToolbar({ showOperators: false }).groups).toEqual(["Formulas", "Move the caret"]);
    expect(drawToolbar({ showNavigation: false }).groups).toEqual(["Formulas", "Operators"]);
    expect(drawToolbar({ showOperators: false, showNavigation: false }).buttons).toEqual(["Square root", "Cube root", "Fraction", "Power", "Brackets"]);
  });

  it("stops every button while the field is disabled", () => {
    const host = render(<MathInput autoHideToolbar={false} disabled />);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".math-input__tool")];
    expect(buttons).toHaveLength(11);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it("writes what a pressed button stands for, and moves the caret with the arrows", () => {
    let latex = "";
    const host = render(<MathInput autoHideToolbar={false} defaultValue="12" onChange={(value) => { latex = value; }} />);
    const press = (title: string) => act(() => host.querySelector<HTMLButtonElement>(`.math-input__tool[title="${title}"]`)!.click());
    // The caret starts at the end of the row, so Back steps between the digits.
    press("Back");
    press("Plus");
    expect(latex).toBe("1+2");
    // A second sign is a correction of the first, pressed as readily as it is typed.
    press("Multiply");
    expect(latex).toBe("1\\cdot 2");
  });
});

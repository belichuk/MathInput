// @vitest-environment jsdom
import { type ReactElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { type MathInputProps, type ToolbarOptions, MathInput } from "./MathInput";

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
function drawToolbar(options: ToolbarOptions = {}, props: Partial<MathInputProps> = {}) {
  const host = render(<MathInput toolbar={{ autoHide: false, ...options }} {...props} />);
  const read = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];
  return {
    strips: read(".math-input__toolbar").length,
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
    expect(drawToolbar({ operators: false }).dividers).toBe(1);
    expect(drawToolbar({ operators: false, navigation: false }).dividers).toBe(0);
  });

  it("drops the group a switch turns off and keeps the rest", () => {
    expect(drawToolbar({ operators: false }).groups).toEqual(["Formulas", "Move the caret"]);
    expect(drawToolbar({ navigation: false }).groups).toEqual(["Formulas", "Operators"]);
    expect(drawToolbar({ operators: false, navigation: false }).buttons).toEqual(["Square root", "Cube root", "Fraction", "Power", "Brackets"]);
    // The constructs have a switch of their own now. They had none, which was defensible while
    // the alternative was three props — a field that builds no formulas is still a field whose
    // keyboard builds them, and this only decides what is drawn above it.
    expect(drawToolbar({ constructs: false }).groups).toEqual(["Operators", "Move the caret"]);
  });

  it("goes away entirely, and takes its tab stop with it", () => {
    const host = render(<MathInput toolbar={false} defaultValue={"1\n2"} />);
    expect(host.querySelectorAll(".math-input__toolbar")).toHaveLength(0);
    expect(host.querySelectorAll("button")).toHaveLength(0);
    // Every row is still there, still editable: it is the tools that went, not the editor.
    expect(host.querySelectorAll(".math-input__field")).toHaveLength(2);
  });

  it("stops every button while the field is disabled", () => {
    const host = render(<MathInput toolbar={{ autoHide: false }} disabled />);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".math-input__tool")];
    expect(buttons).toHaveLength(11);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it("writes what a pressed button stands for, and moves the caret with the arrows", () => {
    let latex = "";
    const host = render(<MathInput toolbar={{ autoHide: false }} defaultValue="12" onChange={(value) => { latex = value; }} />);
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

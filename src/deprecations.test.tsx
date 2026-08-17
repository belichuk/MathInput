// @vitest-environment jsdom
import { type ReactElement, act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const groupsOf = (host: HTMLElement) => [...host.querySelectorAll(".math-input__toolbar [role='group']")].map((group) => group.getAttribute("aria-label"));
const pinned = (host: HTMLElement) => host.querySelectorAll(".math-input__toolbar").length > 0;

/**
 * `autoHideToolbar`, `showOperators` and `showNavigation` became one `toolbar` prop in 0.5.0,
 * and the old three still work.
 *
 * A breaking window is not a licence to break in one step. What lands in this release is the
 * deprecation — the new shape, the old shape mapped onto it, and a warning that says what to
 * write instead; the removal waits for 0.7.0, which gives a host a whole minor version in
 * which both spellings are true at once. That is worth the eighty bytes it costs, and it is
 * why the codemod in MIGRATING-0.5.0.md can be run whenever it suits rather than on upgrade
 * day.
 */
describe("the toolbar props that became one prop", () => {
  // The two warning tests come first, and they have to: the warning is once per prop per page,
  // so it is spent by whichever test renders that prop first. Testing a once-per-page effect
  // is order-dependent by construction — the alternative is a reset hatch exported from the
  // component, which would put a test seam in the published types to avoid writing this note.
  it("says what to write instead, once per prop rather than once per render", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const host = render(<MathInput autoHideToolbar={false} />);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("toolbar={{ autoHide: false }}");

      // A keystroke's worth of re-rendering, and the same editor mounted again: still one
      // warning. A deprecation notice per render is a deprecation notice nobody reads.
      act(() => { host.querySelector<HTMLElement>(".math-input__field")!.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "1", bubbles: true, cancelable: true })); });
      render(<MathInput autoHideToolbar showOperators={false} />);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[1][0]).toContain("toolbar={{ operators: false }}");
    } finally {
      warn.mockRestore();
    }
  });

  it("says nothing at all when only the new prop is used", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render(<MathInput toolbar={{ autoHide: false, operators: false, navigation: false, constructs: false }} />);
      render(<MathInput toolbar={false} />);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("still honours all three of the old ones", () => {
    // Pinned by the old spelling: the toolbar is drawn without anything being focused.
    expect(pinned(render(<MathInput autoHideToolbar={false} />))).toBe(true);
    expect(pinned(render(<MathInput />))).toBe(false);
    expect(groupsOf(render(<MathInput autoHideToolbar={false} showOperators={false} />))).toEqual(["Formulas", "Move the caret"]);
    expect(groupsOf(render(<MathInput autoHideToolbar={false} showNavigation={false} />))).toEqual(["Formulas", "Operators"]);
  });

  it("reads the old prop only where the new one is silent, so a half-migrated host is coherent", () => {
    // `toolbar` says nothing about the operators, so `showOperators` is still heard.
    expect(groupsOf(render(<MathInput toolbar={{ autoHide: false }} showOperators={false} />))).toEqual(["Formulas", "Move the caret"]);
    // And where both speak, the new one answers — it is the one the host wrote most recently.
    expect(groupsOf(render(<MathInput toolbar={{ autoHide: false, operators: true }} showOperators={false} />)))
      .toEqual(["Formulas", "Operators", "Move the caret"]);
  });
});

/**
 * The renamed custom property, checked in the stylesheet itself.
 *
 * There is nothing to render here: jsdom does not resolve a `var()` chain, and a browser test
 * of a fallback would be a test of the browser. What can be checked — and is the whole of the
 * promise — is that the new name is read first, the old one second, and that no rule reaches
 * for either directly, since a rule that did would be the one place the pair falls out of step.
 */
describe("the custom property that was renamed", () => {
  // Read from the project root rather than from `import.meta.url`, which under jsdom is an
  // http URL and not a path to anything.
  const stylesheet = readFileSync("src/MathInput.css", "utf8");

  it("reads the new name first and the old one after it", () => {
    expect(stylesheet).toContain("--_control-hover-border: var(--math-input-control-hover-border-color, var(--math-input-control-hover-border));");
  });

  it("is read through that one value everywhere it is used", () => {
    const uses = stylesheet.match(/var\(--math-input-control-hover-border[^-)]/g) ?? [];
    expect(uses).toEqual([]);
    expect(stylesheet.match(/var\(--_control-hover-border\)/g)).toHaveLength(2);
  });
});

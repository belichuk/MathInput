import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { MathInput } from "../src";
import "./capture.css";

/**
 * The pages the README's images are taken from.
 *
 * A screenshot of the demo would carry the demo with it — a sidebar, a heading, a panel of
 * copyable source — none of which is the component. This renders one scene at a time, at the
 * field's own width and nothing else, so a capture of the viewport *is* a capture of the
 * component. `?scene=` picks which.
 *
 * It is not built into `dist-demo`: it exists to be photographed, and a page that is only ever
 * photographed should not be shipped as though somebody might visit it.
 */
const VIOLET = {
  "--math-input-radius": "24px",
  "--math-input-border-color": "#6750a4",
  "--math-input-accent-color": "#6750a4",
  "--math-input-control-color": "#6750a4",
  "--math-input-control-hover-color": "#21005d",
  "--math-input-surface": "#fefbff",
  "--math-input-subtle-surface": "#f6f0fff2",
  "--math-input-soft-border-color": "#e5daff",
  "--math-input-color": "#1d192b",
  "--math-input-field-padding": "18px",
} as CSSProperties;

const SCENES: Record<string, () => JSX.Element> = {
  // The headline image: one field, tools showing, a formula that exercises the typography —
  // a stacked fraction, a script, a root over a sum, and a relation.
  field: () => <MathInput defaultValue="\frac{1}{2}x^{2}+\sqrt{16}=12" toolbar={{ autoHide: false }} />,
  // A worked solution, which is what rows are for.
  rows: () => <MathInput defaultValue={"2x+3=11\n2x=8\nx=4"} toolbar={{ autoHide: false }} />,
  // The same component with nine custom properties set, to show that theming is CSS and
  // nothing else.
  themed: () => <MathInput defaultValue="\frac{1}{2}x^{2}+\sqrt{16}=12" toolbar={{ autoHide: false }} style={VIOLET} />,
  // Deep nesting, for the image that shows what "structural" means: every box is a slot the
  // caret can be moved into. No `\pm`: the reader knows the subset the writer emits and nothing
  // else, so a command it has never heard of would be photographed as its own source.
  nested: () => <MathInput defaultValue="x=\frac{-b+\sqrt{b^{2}-4\cdot a\cdot c}}{2\cdot a}" toolbar={{ autoHide: false }} />,
  // Empty, for the recording: the GIF is typed into this one.
  empty: () => <MathInput placeholder="Show your working…" toolbar={{ autoHide: false }} />,
};

const scene = new URLSearchParams(window.location.search).get("scene") ?? "field";
const Scene = SCENES[scene] ?? SCENES.field;
createRoot(document.getElementById("root")!).render(<Scene />);

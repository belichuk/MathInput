# MathInput

A dependency-free React + TypeScript editor for entering mathematical working in a familiar, one-line-per-formula layout. It renders fractions, square roots, and powers visually while emitting KaTeX-compatible LaTeX source. It does not evaluate or validate expressions.

## Run the demo

```sh
npm install
npm run dev
```

Create a production build with:

```sh
npm run build
```

## Use the component

```tsx
import { useState } from "react";
import { MathInput } from "./src";

export function Example() {
  const [latex, setLatex] = useState("");

  return (
    <MathInput
      value={latex}
      onChange={setLatex}
      placeholder="Show your working…"
    />
  );
}
```

`value` and `onChange` make the editor controlled. Alternatively, pass `defaultValue` for an initial uncontrolled value. Each formula row is returned as a line of LaTeX, separated with `\n`.

## Editing formulas

When a row is active, its formula tools let learners insert:

- Square roots: `\sqrt{…}`
- Nth roots: `\sqrt[n]{…}`
- Fractions: `\frac{…}{…}`
- Powers: `…^{…}`
- Subscripts: `…_{…}`
- Brackets: `\left(…\right)`

Typing `/` turns the term immediately before the caret into the numerator of a new fraction and moves the caret to its denominator, so `10 /` becomes `\frac{10}{}`. Typing `^` and `_` do the same for powers and subscripts: `10^2` produces `10^{2}` as a *single* object, base included, so the whole power can be selected, deleted or made into a numerator at once. Where a complete formula sits directly before the caret, that formula is what gets taken — `\frac{1}{2}` followed by `/` nests the fraction into a new numerator.

Typing `(` opens a bracket pair, which grows to fit whatever is put inside it, and `)` steps back out. Spaces are ignored. Typing `*` shows `×` and emits `\times`. The division key (`/` or `÷`) always starts a fraction rather than leaving a literal slash in the formula.

The editor treats a formula as a navigable object rather than plain text:

- `→` and `←` step through every slot of a formula in reading order — a power's base before its exponent, a numerator before its denominator, a root's index before its radicand — and then out to the position after (or before) the whole formula.
- Clicking inside any slot places the caret in that part of the formula.
- Clicking past a formula's edge, or pressing `End`, continues after it.
- Typing `=` steps out of the innermost formula it is typed in, avoiding invalid placements such as `10^=2`.
- `Backspace` removes the formula immediately behind the caret as one object, whatever it contains. Inside a slot it deletes normally; at the start of a slot it steps out — into the previous slot, or to just before the formula — leaving the content alone. Only when every slot of a formula is empty does the next `Backspace` remove that formula. `Delete` mirrors all of this forwards. Never more than one thing goes per keypress.
- A selection spanning two slots deletes the covered part of each and keeps the formula: half a fraction is not a thing.
- `Ctrl`/`Cmd`+`Z` undoes and `Shift`+`Ctrl`/`Cmd`+`Z` redoes. A run of typing undoes in one step, and moving the caret ends the run.

Press `Enter` or use the row action to add another formula row. Rows can be removed when more than one exists.

## How it works

The editor is structure-first: each row is a typed tree (text runs, roots, fractions, powers, subscripts, brackets) held in React state, and the contentEditable DOM is a rendering of that tree rather than the source of truth. Keystrokes are intercepted and run through pure reducers that edit the tree, React re-renders, and the caret — a plain `{path, offset}` value — is written back into a DOM range afterwards.

Two properties fall out of this. Caret questions like "is this the end of the slot?" are array index comparisons rather than DOM boundary-point comparisons, which is a class of bug the editor can no longer have. And every editing operation is a pure function, so the behaviour above is covered by unit tests rather than only by clicking around.

## Debugging aids

The demo displays two live sections below the editor:

- **Raw value** — the emitted KaTeX-compatible LaTeX.
- **Keyboard log** — every key pressed in the editor.

Both values can be copied with their respective Copy buttons.

## Props

| Prop | Description |
| --- | --- |
| `value` | Controlled LaTeX value. Formula rows are separated by newlines. |
| `defaultValue` | Initial LaTeX value for uncontrolled usage. |
| `onChange` | Receives the serialized LaTeX value after each edit. |
| `placeholder` | Text shown for an empty first row. |
| `disabled` | Disables editing and formula tools. |
| `className`, `style` | Optional wrapper styling hooks. |
| `aria-label` | Accessible name for the editor. |

## Project structure

- `src/` contains the reusable `MathInput` component, its public exports, and the pure modules it is built from:

  | File | Responsibility |
  | --- | --- |
  | `model.ts` | The formula tree: node types, the alternating-array invariant, path arithmetic. |
  | `parse.ts`, `serialize.ts` | LaTeX in and out. |
  | `caret.ts` | Caret movement over the tree. |
  | `reducers.ts` | Every editing operation, as `(row, caret) → (row, caret)`. |
  | `render.tsx` | The tree as JSX, with each element tagged by the position it stands for. |
  | `selection.ts` | The only code that touches DOM `Range`/`Selection`. |
  | `history.ts` | Undo/redo. |

- `demo/` contains the Vite entry point, global demo styles, and the example page.

## Tests

```sh
npm test
```

Everything except `selection.ts` is pure and directly tested — the parser's fallbacks, a
round-trip property corpus, caret navigation, and each editing behaviour listed above.
Tests also assert the tree's invariant and a valid caret after *every* reduction, so a
reducer cannot quietly leave the document in a state the rest of the editor assumes away.
DOM range mapping, pointer targeting and IME are verified in a browser instead.

## Styling and CSS variables

MathInput has no Tailwind dependency. It imports a small plain-CSS stylesheet and exposes its visual contract as CSS custom properties on the component root. Set them with a wrapper class or the component’s `style` prop:

```tsx
import type { CSSProperties } from "react";

const fieldStyle = {
  "--math-input-radius": "24px",
  "--math-input-border-color": "#6750a4",
  "--math-input-accent-color": "#6750a4",
  "--math-input-surface": "#fefbff",
  "--math-input-color": "#1d192b",
  "--math-input-field-padding": "18px",
} as CSSProperties;

<MathInput style={fieldStyle} />;
```

| Variable | Controls |
| --- | --- |
| `--math-input-radius` | Editor and panel corner radius. |
| `--math-input-border-color`, `--math-input-border-width` | Main field border. |
| `--math-input-surface`, `--math-input-subtle-surface` | Field and supporting-panel backgrounds. |
| `--math-input-color`, `--math-input-placeholder-color`, `--math-input-muted-color` | Formula, placeholder, and supporting text colors. |
| `--math-input-accent-color`, `--math-input-accent-soft-color` | Caret, focus state, and active treatments. |
| `--math-input-control-color`, `--math-input-control-hover-color` | Formula tool colors. |
| `--math-input-field-padding`, `--math-input-field-min-height`, `--math-input-field-font-size` | Field spacing and scale. |
| `--math-input-font-family`, `--math-input-math-font-family` | Utility and mathematical typography. |

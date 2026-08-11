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
- Fractions: `\frac{…}{…}`
- Powers: `^{…}`

Typing `/` converts the immediately preceding number or term into the numerator of a new fraction and moves the caret to its denominator. For example, `10 /` becomes `\frac{10}{}`.

Spaces are ignored. Typing `*` shows `×` and emits `\times`; typing `^` opens a power placeholder at the caret. The division key (`/` or `÷`) always starts a fraction rather than leaving a literal slash in the formula.

The editor treats a formula as a navigable object rather than plain text:

- `→` moves from a numerator to its denominator, then to the position after the formula.
- `←` moves back through the same positions.
- Clicking inside a numerator, denominator, radical, or power places the caret in that part of the formula.
- Clicking immediately to the right of a formula, or pressing `End`, continues after it.
- Typing `=` while inside a formula places it after the whole formula, avoiding invalid placements such as `10^=2`.
- `Backspace` and `Delete` act only in the current slot (or immediately adjacent formula at the row level). Once every slot of a root, fraction, or power is empty, the next destructive key removes that template as one object.

Press `Enter` or use the row action to add another formula row. Rows can be removed when more than one exists.

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

- `src/` contains the reusable `MathInput` component and its public exports.
- `demo/` contains the Vite entry point, global demo styles, and the example page.

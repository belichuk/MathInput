# MathInput

A dependency-free React + TypeScript editor for entering mathematical working in a familiar, one-line-per-formula layout. It renders fractions, square roots, and powers visually while emitting KaTeX-compatible LaTeX source. It does not evaluate or validate expressions.

## Install

```sh
npm install @belichuk/math-input
```

React 18 or 19 is a peer dependency. The component ships its own stylesheet, which is imported once, wherever suits your app:

```ts
import "@belichuk/math-input/styles.css";
```

## Use the component

```tsx
import { useState } from "react";
import { MathInput } from "@belichuk/math-input";

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

## Work on it

```sh
npm install
npm run dev     # the demo, at localhost:5173
npm test
npm run build   # the package: dist/math-input.js, .cjs, .css and dist/types
```

The demo is a style laboratory for developing against and for a first look at the component; it is not part of what ships. `npm run build:demo` builds it into `dist-demo/` if you want to host it somewhere.

## Editing formulas

When a row is active, its formula tools let learners insert:

- Square roots: `\sqrt{…}`
- Cube roots: `\sqrt[3]{…}`
- Fractions: `\frac{…}{…}`
- Powers: `…^{…}`
- Brackets: `\left(…\right)`

Subscripts have no button — they are written with `_`. Roots of any other index keep working as well: `\sqrt[n]{…}` is read, edited and written back, it is simply not what the button inserts.

Typing `/` turns the term immediately before the caret into the numerator of a new fraction and moves the caret to its denominator, so `10 /` becomes `\frac{10}{}`. Typing `^` and `_` do the same for powers and subscripts: `10^2` produces `10^{2}` as a *single* object, base included, so the whole power can be selected, deleted or made into a numerator at once. Where a complete formula sits directly before the caret, that formula is what gets taken — `\frac{1}{2}` followed by `/` nests the fraction into a new numerator.

A formula opened in front of written work wraps that work instead of pushing it aside. With the caret at `1/2+|10`, typing `(` gives `\frac{1}{2}+\left(10\right)` with the caret after the `10` and still inside the brackets, so typing carries straight on. Roots and fractions do the same — the slot the caret was going to land in takes the term in front of it, a whole formula included, so `(` typed in front of `\frac{1}{2}` brackets the fraction rather than sitting beside it. Only that one term is taken, leaving the rest of the row alone: `|10+20` with the root button gives `\sqrt{10}+20`. `/` can take a term on each side, `10|5` becoming `\frac{10}{5}`. Where nothing is written in front of the caret the formula opens empty, as before.

Typing `(` opens a bracket pair, which grows to fit whatever is put inside it, and `)` steps back out. Spaces are ignored. Typing `*` shows `⋅` and emits `\cdot`; `\times` is still read, and comes back out as `\cdot`. The division key (`/` or `÷`) always starts a fraction rather than leaving a literal slash in the formula.

The editor treats a formula as a navigable object rather than plain text:

- `→` and `←` step through every slot of a formula in reading order — a power's base before its exponent, a numerator before its denominator, a root's index before its radicand — and then out to the position after (or before) the whole formula.
- Clicking inside any slot places the caret in that part of the formula.
- Clicking past a formula's edge, or pressing `End`, continues after it.
- Typing `=` comes out to the row before writing itself, so it always separates whole formulas: pressed deep inside `\frac{1}{\frac{1}{2}}` it lands after the outer fraction, never inside a slot, and `10^=2` cannot be typed at all.
- `Backspace` removes the formula immediately behind the caret as one object, whatever it contains. Inside a slot it deletes normally; at the start of a slot it steps out — into the previous slot, or to just before the formula — leaving the content alone. Only when every slot of a formula is empty does the next `Backspace` remove that formula. `Delete` mirrors all of this forwards. Never more than one thing goes per keypress.
- A selection spanning two slots deletes the covered part of each and keeps the formula: half a fraction is not a thing.
- `Ctrl`/`Cmd`+`Z` undoes and `Shift`+`Ctrl`/`Cmd`+`Z` redoes. A run of typing undoes in one step, and moving the caret ends the run.

Press `Enter` or use the row action to add another formula row. Rows can be removed when more than one exists.

A formula that outgrows its row scrolls sideways, following the caret as it moves. Its scrollbar is drawn over the field rather than inside it, because a native one takes its own height out of the row and would make the row jump the moment the formula got too long — a row only ever changes height for the formula in it. Dragging that bar scrolls its row and nothing else: the row you are editing keeps the focus and the caret, so reading one line never costs you your place in another.

The tools follow the caret and disappear when the editor is left. `autoHideToolbar={false}` keeps them on screen instead, on the row the caret last sat in; using a tool then also puts the caret back into that row.

## Keyboard policy

A keystroke aimed at a formula belongs to the editor alone. Every key the editor takes — printable characters, `Backspace` and `Delete`, `←` `→`, `Home`, `End`, `Enter`, `Escape`, `Ctrl`/`Cmd`+`Z`/`Y`, and anything an IME is composing — stops at the component, press and release alike, so a page that opens a search box on `/` or steps a carousel on `←` does not act on a fraction being typed. The host does not have to guard its own shortcuts against the editor.

Keys the editor has no use for are left completely alone: `Tab` and `Shift`+`Tab` still move focus, and application shortcuts such as `Ctrl`/`Cmd`+`S` still arrive, as do `Ctrl`/`Cmd`+`C`/`V`/`A`, which the field handles natively.

`Escape` leaves the field. It is taken like the rest, so a dialog around the editor closes on the second press — the first one steps out of the formula, the second reaches the dialog.

A host that genuinely needs to watch every keystroke can listen in the capture phase above the editor, which runs before the component sees the event; the demo's keyboard log does exactly that.

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
| `autoHideToolbar` | Defaults to `true`: a row's tools appear only while it has focus. Set it to `false` to keep them visible on the row the caret last sat in — the first row until the editor is used. |
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

- `CHANGELOG.md` records what changed in each version, and what is deliberately still open.

## Tests

```sh
npm test
```

Everything except `selection.ts` is pure and directly tested — the parser's fallbacks, a
round-trip property corpus, caret navigation, and each editing behaviour listed above.
Tests also assert the tree's invariant and a valid caret after *every* reduction, so a
reducer cannot quietly leave the document in a state the rest of the editor assumes away.
DOM range mapping, pointer targeting and IME are verified in a browser instead.

## Releasing

A release is a tag. Bump `version` in `package.json`, write that version's section of `CHANGELOG.md`, commit, then:

```sh
git tag v0.3.0
git push origin v0.3.0
```

`.github/workflows/release.yml` takes it from there: it refuses a tag that disagrees with `package.json` or has no section in the changelog, runs the tests, builds the package, publishes it to npm with provenance, and opens a GitHub release whose notes are that changelog section, with the tarball attached. A version with a suffix — `v1.0.0-rc.1` — is marked a prerelease.

Publishing needs one secret in the repository's settings: `NPM_TOKEN`, an npm **automation** token for an account that can publish under `@belichuk`.

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

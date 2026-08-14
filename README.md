# MathInput

[![npm](https://img.shields.io/npm/v/@belichuk/math-input)](https://www.npmjs.com/package/@belichuk/math-input)
[![CI](https://github.com/belichuk/MathInput/actions/workflows/ci.yml/badge.svg)](https://github.com/belichuk/MathInput/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@belichuk/math-input)](./LICENSE)

A React field for writing mathematics the way it is written on paper — one formula per line, fractions stacked, roots drawn over what they cover — that hands your app KaTeX-compatible LaTeX as the value. No runtime dependencies beyond React: no Tailwind, no MathJax, no editor framework. It does not evaluate or check what is written; it is an input, not a calculator.

![The field, with its formula tools, showing ½x² + √16 = 12](https://raw.githubusercontent.com/belichuk/MathInput/main/docs/images/field.png)

## Install

```sh
npm install @belichuk/math-input
```

React 18 or 19 is a peer dependency. Import the stylesheet once, anywhere in your app:

```ts
import "@belichuk/math-input/styles.css";
```

## Quick start

```tsx
import { useState } from "react";
import { MathInput } from "@belichuk/math-input";

export function AnswerField() {
  const [value, setValue] = useState("");

  return (
    <MathInput
      value={value}
      onChange={setValue}
      placeholder="Show your working…"
    />
  );
}
```

`value` is a plain string — `\frac{1}{2}x^{2}+\sqrt{16}=12` for the screenshot above — ready to store, mark, or render with KaTeX.

## Props

Everything is optional; `<MathInput />` on its own is a working uncontrolled field.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | `string` | — | Makes the field controlled. One formula per line, rows separated by `\n`. |
| `defaultValue` | `string` | `""` | Starting value when you are not controlling it. |
| `onChange` | `(value: string) => void` | — | Called with the LaTeX after every edit. |
| `placeholder` | `string` | `"Write a formula…"` | Shown in a row while it is empty. |
| `disabled` | `boolean` | `false` | Nothing can be typed and the tools stop responding. The formula stays readable and selectable. |
| `autoHideToolbar` | `boolean` | `true` | Tools appear on the focused row only. `false` keeps them on the row the caret last sat in. |
| `className` | `string` | `""` | Added to the wrapper element. |
| `style` | `CSSProperties` | — | Wrapper style, and where the CSS variables below go. |
| `aria-label` | `string` | `"Math editor"` | The editor's accessible name; each row is named from it too. |

### Controlled or uncontrolled

Pass `value` and `onChange` to own the state, or `defaultValue` and let the field keep its own:

```tsx
<MathInput value={value} onChange={setValue} />      // controlled
<MathInput defaultValue="x^{2}+1" onChange={save} />  // uncontrolled, still reports edits
```

A controlled `value` you did not just receive from `onChange` replaces the content, so setting it from elsewhere — loading a saved answer, resetting a form — works as you would expect.

### More than one row

`Enter`, or the row button on the right, adds a row; a row can be removed once there is more than one. Rows are how a worked solution is written, and they come back as lines:

```tsx
<MathInput defaultValue={"2x+3=11\n2x=8\nx=4"} onChange={setSteps} />
```

![Three rows of a worked solution, with the tools on the active row](https://raw.githubusercontent.com/belichuk/MathInput/main/docs/images/rows.png)

### Keeping the tools on screen

By default the tools follow the caret and vanish when the editor is left, which keeps a page of fields quiet. In a single-field layout — a quiz question, a homework box — pinning them is friendlier:

```tsx
<MathInput autoHideToolbar={false} />
```

They then sit on the row the caret last used, on the first row until the field is touched. Using a tool while the row is not focused puts the caret back in that row, so typing carries on where the edit landed.

### Read-only

```tsx
<MathInput value={submitted} disabled />
```

The formula still renders and can be selected and copied; only editing stops.

## What can be typed

The tools insert a square root, a cube root, a fraction, a power and brackets. Subscripts have no button — `_` writes them. Everything else is the keyboard:

| Key | What it does |
| --- | --- |
| `/` or `÷` | Starts a fraction, taking the term before the caret as the numerator: `10/` becomes `\frac{10}{}` |
| `^` | Starts a power, taking the term before the caret as the base: `10^2` is one object, base included |
| `_` | The same for a subscript, so `x_i^2` nests as a power over a subscript |
| `(` | Opens a bracket pair that grows to fit whatever is put in it |
| `)` | Steps back out of the brackets it is typed in |
| `*` | Written as `⋅` and emitted as `\cdot` |
| `=` | Comes out to the row first, so it always separates whole formulas |
| `←` `→` | Step through every slot in reading order, then out of the formula |
| `Home` `End` | Start and end of the row |
| `Enter` | Adds a row |
| `Backspace` `Delete` | One thing per press: a character, or the formula beside the caret as a whole |
| `Ctrl`/`Cmd`+`Z`, `Shift`+`Ctrl`/`Cmd`+`Z` | Undo and redo, a run of typing at a time |
| `Esc` | Leaves the field |
| `Tab` | Moves focus onward, untouched by the editor |

Spaces are ignored, and a formula opened in front of written work wraps it: with the caret at `1/2+|10`, typing `(` gives `\frac{1}{2}+\left(10\right)` with the caret inside the brackets, after the `10`.

## Styling

The stylesheet is small, plain CSS, and everything visual is a custom property on the component root. Set them through `style`, or from a class of your own:

```tsx
import type { CSSProperties } from "react";

const fieldStyle = {
  "--math-input-radius": "24px",
  "--math-input-border-color": "#6750a4",
  "--math-input-accent-color": "#6750a4",
  "--math-input-control-color": "#6750a4",
  "--math-input-surface": "#fefbff",
  "--math-input-subtle-surface": "#f6f0ff",
  "--math-input-soft-border-color": "#e5daff",
  "--math-input-color": "#1d192b",
  "--math-input-field-padding": "18px",
} as CSSProperties;

<MathInput style={fieldStyle} autoHideToolbar={false} />;
```

![The same editor in a violet theme](https://raw.githubusercontent.com/belichuk/MathInput/main/docs/images/themed.png)

| Variable | Default | Controls |
| --- | --- | --- |
| `--math-input-color` | `#263956` | The formula itself |
| `--math-input-muted-color` | `#8094b2` | Supporting marks, such as the remove-row control |
| `--math-input-placeholder-color` | `#8ba0bd` | Placeholder text |
| `--math-input-surface` | `#ffffff` | Field background |
| `--math-input-subtle-surface` | `#f7f9fc` | Toolbar and focused-row background |
| `--math-input-border-color` | `#647895` | The field's border |
| `--math-input-border-width` | `2px` | Its thickness |
| `--math-input-soft-border-color` | `#dbe4ef` | Row dividers, control borders, the scrollbar |
| `--math-input-accent-color` | `#4d6f9a` | Caret and the focused row's marker |
| `--math-input-accent-soft-color` | `#e7eef8` | Focus rings |
| `--math-input-control-color` | `#506887` | Tool icons |
| `--math-input-control-hover-color` | `#2f4c70` | Tool icons, hovered |
| `--math-input-control-hover-border` | `#9db2cc` | Tool borders, hovered |
| `--math-input-radius` | `16px` | Field corners |
| `--math-input-control-radius` | `8px` | Button corners |
| `--math-input-field-padding` | `14px` | Space around a formula |
| `--math-input-field-min-height` | `60px` | Shortest a row can be |
| `--math-input-field-font-size` | `1.25rem` | Formula size |
| `--math-input-font-family` | `ui-monospace, …` | Placeholder and interface text |
| `--math-input-math-font-family` | `"STIX Two Math", …` | The mathematics |
| `--math-input-max-width` | `48rem` | Widest the editor grows |

A row that outgrows its width scrolls sideways, following the caret. Its scrollbar is drawn over the field rather than inside it, so a row only ever changes height for the formula in it — never mid-word because the text got long. Dragging that bar scrolls its row and nothing else: the row you are editing keeps the focus and the caret.

## The value

Each row is serialized as a line of LaTeX and joined with `\n`. What comes out parses back to exactly what you saw, and is what KaTeX renders:

| Written | Value |
| --- | --- |
| ½ as a stacked fraction | `\frac{1}{2}` |
| a square root of 9 + 16 | `\sqrt{9+16}` |
| a cube root of 8 | `\sqrt[3]{8}` |
| x squared | `x^{2}` |
| x sub i | `x_{i}` |
| brackets | `\left(9+16\right)` |
| two times three | `2\cdot 3` |

Input is read more loosely than it is written: `\times` and `×` both arrive as `⋅`, `\sqrt[n]{…}` of any index is kept and remains editable, and malformed input is tolerated rather than rejected — a command with no group falls back to its own text, and an unclosed group is treated as closed.

## Recipes

### In a form

`Enter` adds a row and never submits the form around it, so a submit button is the way out:

```tsx
export function AnswerForm({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
      <MathInput value={value} onChange={setValue} aria-label="Your answer" />
      <button type="submit" disabled={value.trim() === ""}>Submit</button>
    </form>
  );
}
```

`value` is just a string, so the usual form libraries need nothing special — `<Controller>` in React Hook Form, `<Field>` in Formik, or your own state.

### Loading, resetting, and clearing

Because a controlled `value` you did not just receive from `onChange` replaces the content, all three are ordinary state changes:

```tsx
useEffect(() => setValue(saved ?? ""), [saved]);          // load a stored answer
<button type="button" onClick={() => setValue("")}>Clear</button>
```

### Showing an answer without letting it be edited

The cheapest way is the component you already have — no second rendering path, and no extra dependency:

```tsx
<MathInput value={submitted} disabled aria-label="Submitted answer" />
```

If you would rather render it as static mathematics — in a PDF, an email, a page that never loads the editor — the value is ordinary LaTeX, so KaTeX takes it directly:

```tsx
import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export function Rendered({ value }: { value: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (host.current) katex.render(value, host.current, { throwOnError: false });
  }, [value]);

  return <div ref={host} />;
}
```

For several rows, split on `\n` and render each line into its own element.

### Several fields on a page

Nothing needs coordinating, and the default `autoHideToolbar` keeps a page of fields quiet — only the focused one shows its tools. Give each an `aria-label` so they are distinguishable:

```tsx
{questions.map((question) => (
  <MathInput
    key={question.id}
    value={answers[question.id] ?? ""}
    onChange={(value) => setAnswer(question.id, value)}
    aria-label={`Answer to question ${question.number}`}
  />
))}
```

## Size

What a browser downloads, for the component as it stands:

| | Raw | Gzipped |
| --- | --- | --- |
| `math-input.js` (ESM) | 39.6 kB | **11.9 kB** |
| `math-input.css` | 7.2 kB | **2.0 kB** |

About 14 kB gzipped in total, with React the only thing it expects to already be there. For comparison, KaTeX alone is an order of magnitude larger, and this is a whole editor.

There is nothing to tree-shake off: one entry, one component, and every module behind it is on the path from typing a key to seeing a formula. The build is already minified — forcing `minify: "esbuild"` instead of the default makes it 3% *bigger* — and `sideEffects` is declared, so a bundler is free to drop the stylesheet if you never import it.

The npm tarball is larger than the numbers above (~107 kB) because it also carries the CommonJS build, source maps and type declarations. None of that reaches your users; bundlers take the ESM build and leave the rest.

## Frameworks

- **Next.js and other server-rendered apps** — the editor is a browser thing: it owns a `contentEditable`, and reads and writes DOM ranges. Put `"use client"` at the top of the file that renders it. Server rendering the markup is fine; the caret work starts on mount.
- **Vite, webpack, Parcel, Rspack** — nothing to configure. The package is ESM with a CommonJS build alongside it, and the stylesheet is a separate import.
- **Jest** — the CommonJS build means `require` works without transform configuration. If your own code imports `@belichuk/math-input/styles.css`, Jest needs a stub for it like any other CSS import (`moduleNameMapper`). Vitest needs nothing.

## Browser support

Current Chrome, Edge, Safari and Firefox, on desktop and mobile. The editor is built on `beforeinput` and its `inputType` — which is also what makes mobile keyboards work, where `keydown` cannot be trusted — plus DOM ranges, `ResizeObserver` and pointer events.

One thing to know: rows are identified with `crypto.randomUUID`, which browsers only expose in a **secure context**. That covers `https://` and `localhost`, but not a plain `http://` origin such as a LAN address you might use to test on a phone. Serve over HTTPS there.

## Accessibility

The editor is a `textbox` per row, named from `aria-label` (`"Math editor, row 2"`), reachable and leavable with `Tab`, and driven entirely from the keyboard. `Esc` steps out of the field. Every tool is a real button with a label and a title. What it does not yet do is announce the formula's structure to a screen reader beyond the text it contains.

## Keyboard policy

A keystroke aimed at a formula belongs to the editor alone. Every key the editor takes — printable characters, `Backspace` and `Delete`, `←` `→`, `Home`, `End`, `Enter`, `Escape`, `Ctrl`/`Cmd`+`Z`/`Y`, and anything an IME is composing — stops at the component, press and release alike, so a page that opens a search box on `/` or steps a carousel on `←` does not act on a fraction being typed. The host does not have to guard its own shortcuts against the editor.

Keys the editor has no use for are left completely alone: `Tab` and `Shift`+`Tab` still move focus, and application shortcuts such as `Ctrl`/`Cmd`+`S` still arrive, as do `Ctrl`/`Cmd`+`C`/`V`/`A`, which the field handles natively.

`Escape` leaves the field. It is taken like the rest, so a dialog around the editor closes on the second press — the first steps out of the formula, the second reaches the dialog.

A host that genuinely needs to watch every keystroke can listen in the capture phase above the editor, which runs before the component sees the event; the demo's keyboard log does exactly that.

## Editing formulas in detail

Typing `/` turns the term immediately before the caret into the numerator of a new fraction and moves the caret to its denominator, so `10 /` becomes `\frac{10}{}`. Typing `^` and `_` do the same for powers and subscripts: `10^2` produces `10^{2}` as a *single* object, base included, so the whole power can be selected, deleted or made into a numerator at once. Where a complete formula sits directly before the caret, that formula is what gets taken — `\frac{1}{2}` followed by `/` nests the fraction into a new numerator.

A formula opened in front of written work wraps that work instead of pushing it aside. Roots and fractions behave like the brackets above: the slot the caret was going to land in takes the term in front of it, a whole formula included, so `(` typed in front of `\frac{1}{2}` brackets the fraction rather than sitting beside it. Only that one term is taken, leaving the rest of the row alone: `|10+20` with the root button gives `\sqrt{10}+20`. `/` can take a term on each side, `10|5` becoming `\frac{10}{5}`. Where nothing is written in front of the caret the formula opens empty.

The editor treats a formula as a navigable object rather than plain text:

- `→` and `←` step through every slot of a formula in reading order — a power's base before its exponent, a numerator before its denominator, a root's index before its radicand — and then out to the position after (or before) the whole formula.
- Clicking inside any slot places the caret in that part of the formula.
- Clicking past a formula's edge, or pressing `End`, continues after it.
- Typing `=` comes out to the row before writing itself, so it always separates whole formulas: pressed deep inside `\frac{1}{\frac{1}{2}}` it lands after the outer fraction, never inside a slot, and `10^=2` cannot be typed at all.
- `Backspace` removes the formula immediately behind the caret as one object, whatever it contains. Inside a slot it deletes normally; at the start of a slot it steps out — into the previous slot, or to just before the formula — leaving the content alone. Only when every slot of a formula is empty does the next `Backspace` remove that formula. `Delete` mirrors all of this forwards. Never more than one thing goes per keypress.
- A selection spanning two slots deletes the covered part of each and keeps the formula: half a fraction is not a thing.
- `Ctrl`/`Cmd`+`Z` undoes and `Shift`+`Ctrl`/`Cmd`+`Z` redoes. A run of typing undoes in one step, and moving the caret ends the run.

## How it works

The editor is structure-first: each row is a typed tree (text runs, roots, fractions, powers, subscripts, brackets) held in React state, and the contentEditable DOM is a rendering of that tree rather than the source of truth. Keystrokes are intercepted and run through pure reducers that edit the tree, React re-renders, and the caret — a plain `{path, offset}` value — is written back into a DOM range afterwards.

Two properties fall out of this. Caret questions like "is this the end of the slot?" are array index comparisons rather than DOM boundary-point comparisons, which is a class of bug the editor can no longer have. And every editing operation is a pure function, so the behaviour above is covered by unit tests rather than only by clicking around.

## Work on it

```sh
npm install
npm run dev       # the demo, at localhost:5173
npm test          # or test:watch
npm run typecheck # the whole repository, demo and configs included
npm run build     # the package: dist/math-input.js, .cjs, .css and dist/types
npm run build:demo
```

The repository is laid out so that the root is about the package and the demo owns itself:

```
src/            the component, and the pure modules it is built from
demo/           the style laboratory: page, entry, index.html, its own vite.config.ts
scripts/        build helpers
docs/images/    the screenshots in this file
vite.config.ts  builds and tests the package — the default config is the product
tsconfig.json   type-checks everything; tsconfig.build.json emits what ships
```

The demo — sliders and colour pickers for the CSS variables above, the live LaTeX value, and a log of every key pressed — is for developing against and for a first look. It is not part of what ships: `files` in `package.json` is `dist` alone, and `npm run build:demo` puts the site in `dist-demo/` if you want to host it.

| `src/` file | Responsibility |
| --- | --- |
| `model.ts` | The formula tree: node types, the alternating-array invariant, path arithmetic. |
| `parse.ts`, `serialize.ts` | LaTeX in and out. |
| `caret.ts` | Caret movement over the tree. |
| `reducers.ts` | Every editing operation, as `(row, caret) → (row, caret)`. |
| `render.tsx` | The tree as JSX, with each element tagged by the position it stands for. |
| `selection.ts` | The only code that touches DOM `Range`/`Selection`. |
| `history.ts` | Undo/redo. |
| `MathInput.tsx` | Props, state, events, and the chrome around the rows. |

`CHANGELOG.md` records what changed in each version, and what is deliberately still open.

Everything except `selection.ts` is pure and directly tested — the parser's fallbacks, a round-trip property corpus, caret navigation, and each editing behaviour above. Tests also assert the tree's invariant and a valid caret after *every* reduction, so a reducer cannot quietly leave the document in a state the rest of the editor assumes away. DOM range mapping, pointer targeting and IME are verified in a browser instead.

## License

MIT © Nikolay Belichuk

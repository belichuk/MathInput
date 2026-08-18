# MathInput

[![npm](https://img.shields.io/npm/v/@belichuk/math-input)](https://www.npmjs.com/package/@belichuk/math-input)
[![CI](https://github.com/belichuk/MathInput/actions/workflows/ci.yml/badge.svg)](https://github.com/belichuk/MathInput/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@belichuk/math-input)](./LICENSE)

A React field for writing mathematics the way it is written on paper — one formula per line, fractions stacked, roots drawn over what they cover — that hands your app KaTeX-compatible LaTeX as the value. No runtime dependencies beyond React: no Tailwind, no MathJax, no editor framework. It does not evaluate or check what is written; it is an input, not a calculator.

![Typing ½ · x² + √16 = 12: the fraction stacks as it is typed, a multiplication sign appears where one was needed, the power raises, and the root draws itself over what it covers](https://raw.githubusercontent.com/belichuk/MathInput/main/docs/images/typing.gif)

Every key in that recording is an ordinary one: `/` opened the fraction, `^` the power, `√` the root, and `Space` stepped out of each. What `onChange` handed back is `\frac{1}{2}\cdot x^{2}+\sqrt{16}=12` — ready to store, mark, or render with KaTeX. The `\cdot` is the only thing nobody typed: `x` written straight against a fraction is multiplying it, and the value says so rather than leaving it to be worked out.

**Contents** · [Install](#install) · [Quick start](#quick-start) · [Props](#props) · [What can be typed](#what-can-be-typed) · [Styling](#styling) · [The value](#the-value) · [Recipes](#recipes) · [Accessibility](#accessibility) · [Migrating to 0.5.0](MIGRATING-0.5.0.md)

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

`value` is a plain string of LaTeX, one line per row. There is no editor instance to hold, no document object to convert, and nothing to serialise: what you store is what `onChange` gave you, and what you pass back to `value` is what the field draws.

## Props

Everything is optional; `<MathInput />` on its own is a working uncontrolled field.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | `string` | — | Makes the field controlled. One formula per line, rows separated by `\n`. |
| `defaultValue` | `string` | `""` | Starting value when you are not controlling it. |
| `onChange` | `(value: string) => void` | — | Called with the LaTeX after every edit. |
| `placeholder` | `string` | `"Write a formula…"` | Shown in a row while it is empty. |
| `disabled` | `boolean` | `false` | Nothing can be typed and the tools stop responding. The formula stays readable and selectable. |
| `toolbar` | `ToolbarOptions \| false` | `{}` | What the tools show, and when — see below. `false` for a field with none at all. |
| `className` | `string` | `""` | Added to the wrapper element. |
| `style` | `CSSProperties` | — | Wrapper style, and where the CSS variables below go. |
| `aria-label` | `string` | `"Math editor"` | The editor's accessible name; each row is named from it too. |

### The toolbar

![The field with its tools: square root, cube root, fraction, power and brackets, then the four operators, then the two arrows](https://raw.githubusercontent.com/belichuk/MathInput/main/docs/images/field.png)

One prop describes the whole strip. Every key is optional and every default is on:

| Key | What it does |
| --- | --- |
| `autoHide` | `true` — the tools appear on the focused row only. `false` keeps them on the row the caret last sat in. |
| `constructs` | The `√` `∛` `½` `xⁿ` `( )` group: the formulas that have to be built rather than typed. |
| `operators` | The `+` `−` `:` `⋅` group. Off for a field only ever filled in from a keyboard. |
| `navigation` | The `←` `→` group, which moves the caret exactly as the arrow keys do. |

```tsx
<MathInput toolbar={{ autoHide: false }} />               // pinned, everything shown
<MathInput toolbar={{ operators: false }} />              // no operator buttons
<MathInput toolbar={false} />                             // no tools at all
```

`toolbar={false}` removes the strip and its tab stop. It also removes the two row controls, which live in it: `Enter` still adds a row, but nothing removes one, since `Backspace` does not yet merge a row into the row above. That is a limitation of this release rather than a property of the prop; until it is lifted, pair `toolbar={false}` with a single-row field.

> **Renamed in 0.5.0.** `autoHideToolbar`, `showOperators` and `showNavigation` still work and still do exactly what they did; each warns once, in development, naming what to write instead. They go in 0.7.0. [MIGRATING-0.5.0.md](MIGRATING-0.5.0.md) has the codemod.

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
<MathInput toolbar={{ autoHide: false }} />
```

They then sit on the row the caret last used, on the first row until the field is touched. Using a tool while the row is not focused puts the caret back in that row, so typing carries on where the edit landed.

### Read-only

```tsx
<MathInput value={submitted} disabled />
```

The formula still renders and can be selected and copied; only editing stops.

## What can be typed

**A worked example**, and it is the one in the recording at the top. Type

```
1/2  ␣  x^2  ␣  +√16  ␣  =12
```

and the field holds `\frac{1}{2}\cdot x^{2}+\sqrt{16}=12`. Each `Space` steps out of the slot the key before it opened — out of a denominator, out of an exponent, out from under a radical — so a whole expression is written without once reaching for the mouse or an arrow key.

The toolbar comes in three groups, divided: the formulas that have to be built — a square root, a cube root, a fraction, a power, brackets — then the four operators `+` `−` `:` `⋅`, then the two arrows that move the caret. Every button does what the matching key does, so a field can be filled in on a tablet with no keyboard at all. Each group is on by default and switched off on its own through `toolbar`. Subscripts have no button — `_` writes them. The rest is the keyboard:

| Key | What it does |
| --- | --- |
| `/` or `÷` | Starts a fraction, taking the term before the caret as the numerator: `10/` becomes `\frac{10}{}` |
| `^` | Starts a power, taking the term before the caret as the base: `10^2` is one object, base included |
| `_` | The same for a subscript, so `x_i^2` nests as a power over a subscript |
| `(` | Opens a bracket pair that grows to fit whatever is put in it |
| `)` | Steps back out of the brackets it is typed in |
| `*` | Written as `⋅` and emitted as `\cdot` |
| a letter or digit typed against a formula | Gets a `⋅` in front of it: `\frac{1}{3}` then `x` is `\frac{1}{3}\cdot x`, and `\sqrt{2}` then `10` is `\sqrt{2}\cdot 10` |
| `√` `∛` | Open a square root and a cube root around what follows, the way `(` opens brackets. Not on most physical keyboards, but on every soft one's symbol page — and they survive dictation, autocorrect and paste |
| `=` | Comes out of anything that cannot hold a relation — a numerator, a radicand, an exponent — and stops at the first thing that can, so `(x=1)` stays inside its brackets |
| `Space` | Steps past what is in front of the caret: the rest of the run, a whole formula, or the slot itself — `\sqrt{9\|}` becomes `\sqrt{9}\|` |
| `←` `→` | Step through every slot in reading order, then out of the formula |
| `↑` `↓` | Move between the slots a formula stacks — numerator and denominator, exponent and base — and between rows when nothing around the caret stacks anything |
| `Home` `End` | Start and end of the row |
| `Enter` | Adds a row |
| `Backspace` `Delete` | One thing per press: a character, or the formula beside the caret as a whole |
| `Ctrl`/`Cmd`+`Z`, `Shift`+`Ctrl`/`Cmd`+`Z` | Undo and redo, a run of typing at a time |
| `Esc` | Leaves the field |
| `Tab`, `Shift`+`Tab` | Walk the slots of the formula, in the order they are drawn. With no slot left in that direction the field is left, the way `Tab` leaves anything else |

Selecting something and then opening a formula writes the formula *around* it: select `x+1`, press `/`, and it is the numerator with the caret waiting in the denominator; press the root button and it is the radicand. The slot the caret is in is marked while you write, so a formula several boxes deep says which box is being filled.

A sign written straight after another takes its place: `1+` then `−` is `1−`, and `1−` then `*` is `1⋅`, from the keyboard or the toolbar. Two signs in a row are a slip rather than a formula, and the second is the correction — so a mistyped operator is fixed by pressing the right one, with no backspace in between. Only a sign replaces a sign: after a digit, a bracket or a whole formula it is simply written, so a minus that opens a row, a bracket or a slot is a negative as it always was.

Pasted LaTeX arrives as the formula it describes rather than as its own source: paste `\frac{1}{2}` and you get a fraction with slots to move around inside. Text with no structure in it is written literally, so pasting `1/2+3` gives those six characters — `/` is not LaTeX, whatever the `/` key does when pressed. No whitespace is ever written into a formula — pasted spaces are dropped, and the space bar moves the caret instead — and a formula opened in front of written work wraps it: with the caret at `1/2+|10`, typing `(` gives `\frac{1}{2}+\left(10\right)` with the caret inside the brackets, after the `10`.

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

<MathInput style={fieldStyle} toolbar={{ autoHide: false }} />;
```

![The same editor in a violet theme](https://raw.githubusercontent.com/belichuk/MathInput/main/docs/images/themed.png)

Every name is `--math-input-` and then what it applies to, which is one of four things:

| Prefix | Applies to |
| --- | --- |
| *(none)* | The component as a whole — its colours, its typefaces, its shape |
| `field-` | The writing surface only: the box a formula is typed into |
| `control-` | The buttons: the tools, the row controls, the scrollbar's thumb |
| `root-` | The radical, whose drawing is the one piece of geometry a host can tune |

Three names predate the rule and are kept rather than churned: `--math-input-border-color`, `--math-input-border-width` and `--math-input-radius` are the *field's* border and corners, so by the rule they would carry `field-`. They are not renamed here, because a rename is only worth a host's time when the old name misleads about what it does, and these do not.

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
| `--math-input-control-hover-border-color` | `#9db2cc` | Tool borders, hovered, and the scrollbar's thumb under the pointer |
| `--math-input-radius` | `16px` | Field corners |
| `--math-input-control-radius` | `8px` | Button corners |
| `--math-input-field-padding` | `14px` | Space around a formula |
| `--math-input-field-min-height` | `60px` | Shortest a row can be |
| `--math-input-field-font-size` | `1.25rem` | Formula size |
| `--math-input-font-family` | `ui-monospace, …` | Placeholder and interface text |
| `--math-input-math-font-family` | `"STIX Two Math", …` | The mathematics |
| `--math-input-rule` | `0.062em` | Every rule the component draws: a fraction's bar, the bar over a radicand, and the radical itself. Floored at a pixel so a hairline never rounds away |
| `--math-input-root-width` | `1.05em` | How far a radical reaches before its bar begins, over a single line of writing |
| `--math-input-operator-space` | `0.222em` | Either side of `+` `−` `⋅` `:` where they are an operation. TeX's medium space |
| `--math-input-relation-space` | `0.278em` | Either side of `=`. TeX's thick space |
| `--math-input-max-width` | `48rem` | Widest the editor grows |

> **Renamed in 0.5.0.** `--math-input-control-hover-border` became `--math-input-control-hover-border-color`, so that it says what it sets the way every other colour here does. Both names are read — the new one first — until 0.7.0, so nothing needs changing today.

Both radical values describe a root over *one line* of writing. A taller root is scaled from them — the stroke grows heavier and the radical reaches further, both stopping once a root is tall enough that more of either would read as a thicker mark rather than a taller one. Setting one value keeps the whole range in proportion; there is nothing to tune per size, because there are no longer three sizes.

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

Nothing needs coordinating, and the default `toolbar.autoHide` keeps a page of fields quiet — only the focused one shows its tools. Give each an `aria-label` so they are distinguishable:

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
| `math-input.js` (ESM) | 39.8 kB | **13.9 kB** |
| `math-input.css` | 8.5 kB | **2.2 kB** |

About 16 kB gzipped in total, with React the only thing it expects to already be there. It grew by 2 kB in 0.5.0, and where it went is worth knowing: rendering a row only when that row changed, and setting mathematics properly — spacing operations, italicising letters, sizing radicals to what they cover. For comparison, KaTeX alone is an order of magnitude larger, and this is a whole editor.

There is nothing to tree-shake off: one entry, one component, and every module behind it is on the path from typing a key to seeing a formula. `sideEffects` is declared, so a bundler is free to drop the stylesheet if you never import it.

One note for anyone measuring their own build of this: the published ES bundle was mangled but pretty-printed until 0.5.0, which cost about 1.5 kB gzipped in whitespace. Forcing `minify: "esbuild"` really does make it 3% *bigger*, as earlier notes here said — the setting that mattered was the bundle's own output minification, which is separate from the build's.

The npm tarball is larger than the numbers above (~176 kB) because it also carries the CommonJS build, source maps and type declarations. None of that reaches your users; bundlers take the ESM build and leave the rest.

## Frameworks

- **Next.js and other server-rendered apps** — the editor is a browser thing: it owns a `contentEditable`, and reads and writes DOM ranges. Put `"use client"` at the top of the file that renders it. Server rendering the markup is fine; the caret work starts on mount.
- **Vite, webpack, Parcel, Rspack** — nothing to configure. The package is ESM with a CommonJS build alongside it, and the stylesheet is a separate import.
- **Jest** — the CommonJS build means `require` works without transform configuration. If your own code imports `@belichuk/math-input/styles.css`, Jest needs a stub for it like any other CSS import (`moduleNameMapper`). Vitest needs nothing.

## Browser support

Current Chrome, Edge, Safari and Firefox, on desktop and mobile. The editor is built on `beforeinput` and its `inputType` — which is also what makes mobile keyboards work, where `keydown` cannot be trusted — plus DOM ranges, `ResizeObserver` and pointer events.

One thing to know: rows are identified with `crypto.randomUUID`, which browsers only expose in a **secure context**. That covers `https://` and `localhost`, but not a plain `http://` origin such as a LAN address you might use to test on a phone. Serve over HTTPS there.

## Accessibility

The editor is a `textbox` per row, named from `aria-label` (`"Math editor, row 2"`), and driven entirely from the keyboard. `Esc` steps out of the field at once.

**`Tab` changed in 0.5.0.** It used to pass straight through, moving focus the way it does anywhere else. It now walks the *slots* of the formula in the order they are drawn — which is what filling one in without a mouse actually needs: open a fraction, write the numerator, `Tab`, write the denominator. When there is no slot left in that direction it is not taken at all and focus leaves the field as before, so the field is never a keyboard trap (WCAG 2.1.2). A host that relied on a single `Tab` always leaving a field should know that it may now take several, and `Esc` still leaves in one.

Every tool is a real button with a label and a title, and the slot the caret is in is marked while you write in it, so a formula several boxes deep says which box is being filled. The toolbar is one tab stop with the arrow keys moving inside it, which is the pattern `role="toolbar"` asks for, and a `disabled` field keeps its place in the tab order so a submitted answer can still be reached, read and copied.

**The formula is described in words.** What is in the DOM is `1`, `2`, `x` in boxes; the structure that makes them a fraction raised to a power is *drawn*, and a drawing reads as nothing. So each row carries a description written from the tree — `\frac{1}{2}x^{2}=\sqrt{16}` is read as *"the fraction 1 over 2, end fraction x squared equals the square root of 16, end root"* — and moving the caret into a slot is announced politely as *"in the denominator"*, because the caret moving somewhere new is a fact a sighted user gets from the drawing and nobody else was told.

Two limits worth stating. It is a plain reading and not MathSpeak or any other standard, so it will not match what a reader announces for KaTeX output elsewhere on the page. And it is English: the strings are all in one module, and a locale option is the change that would let a host replace them, which is not in this release.

The zero-width character the caret needs in an empty slot is hidden from the accessibility tree — but it is still a character in the DOM, so it comes along when a formula is copied with the browser's own copy. That is unchanged from earlier versions and is worth knowing if you compare copied text byte for byte.

## Keyboard policy

A keystroke aimed at a formula belongs to the editor alone. This is the whole of what it takes, press and release alike — the list is the contract, and nothing outside it is touched:

| Contained | |
| --- | --- |
| Printable characters | Everything typed into a formula |
| `Backspace` `Delete` | |
| `←` `→` `Home` `End` | Movement within the row |
| `↑` `↓` | Only while there is a slot or a row to move to; otherwise left alone |
| `Tab` `Shift`+`Tab` | Only while there is a slot left to walk to; otherwise left alone, and focus leaves |
| `Enter` | Adds a row, so a form is never submitted from inside a formula |
| `Escape` | Leaves the field |
| `Ctrl`/`Cmd`+`Z`, `Shift`+`Ctrl`/`Cmd`+`Z`, `Ctrl`/`Cmd`+`Y` | Undo and redo |
| Anything an IME is composing | |

So a page that opens a search box on `/` or steps a carousel on `←` does not act on a fraction being typed, and the host does not have to guard its own shortcuts against the editor.

Everything else is left completely alone: application shortcuts such as `Ctrl`/`Cmd`+`S` still arrive, as do `Ctrl`/`Cmd`+`C`/`V`/`A`, which the field handles natively.

`Escape` leaves the field. It is taken like the rest, so a dialog around the editor closes on the second press — the first steps out of the formula, the second reaches the dialog.

A host that genuinely needs to watch every keystroke can listen in the capture phase above the editor — `addEventListener("keydown", handler, true)` on a container — which runs before the component sees the event.

## Editing formulas in detail

Typing `/` turns the term immediately before the caret into the numerator of a new fraction and moves the caret to its denominator, so `10 /` becomes `\frac{10}{}`. Typing `^` and `_` do the same for powers and subscripts: `10^2` produces `10^{2}` as a *single* object, base included, so the whole power can be selected, deleted or made into a numerator at once. Where a complete formula sits directly before the caret, that formula is what gets taken — `\frac{1}{2}` followed by `/` nests the fraction into a new numerator.

The power tool does the same as `^` when there is a term behind the caret, and opens at the *base* when there is not: a power pressed on an empty row has no base yet, and nothing written from inside the exponent can give it one. Every tool works this way — it opens its formula at the first slot still to be written — so `Space` or `→` carries on into the next one.

A formula opened in front of written work wraps that work instead of pushing it aside. Roots and fractions behave like the brackets above: the slot the caret was going to land in takes the term in front of it, a whole formula included, so `(` typed in front of `\frac{1}{2}` brackets the fraction rather than sitting beside it. Only that one term is taken, leaving the rest of the row alone: `|10+20` with the root button gives `\sqrt{10}+20`. `/` can take a term on each side, `10|5` becoming `\frac{10}{5}`. Where nothing is written in front of the caret the formula opens empty.

![A quadratic formula in the field: a fraction whose numerator holds a root, whose radicand holds a power](https://raw.githubusercontent.com/belichuk/MathInput/main/docs/images/nested.png)

Every box in that formula is a slot the caret can be put in — by clicking it, by `Tab`, or by the arrow keys. The editor treats a formula as a navigable object rather than plain text:

- `→` and `←` step through every slot of a formula in reading order — a power's base before its exponent, a numerator before its denominator, a root's index before its radicand — and then out to the position after (or before) the whole formula.
- `Space` steps *past* what is in front of the caret rather than into it: first the rest of what is being written, then over a whole formula standing next to it, then out of the slot itself — one thing per press, the way `Backspace` removes one thing per press. A slot left this way hands the caret to the *end* of the next one, since what is written there is written: `\frac{1|}{2}` becomes `\frac{1}{2|}`, and the next press leaves the fraction. So `1/2` typed straight through, then `Space`, carries on after the fraction rather than inside it, and a root or a power is left the same way. Nothing is written by the key, at the end of the row it does nothing, and a space in pasted text is still dropped.
- Clicking inside any slot places the caret in that part of the formula.
- Clicking past a formula's edge, or pressing `End`, continues after it.
- Typing `=` comes out of whatever cannot hold a relation and stops at the first thing that can. A numerator, a radicand and an exponent cannot, so `10^=2` cannot be typed at all and `=` pressed deep inside `\frac{1}{\frac{1}{2}}` lands after the outer fraction. Brackets *can*, because `\left(x=1\right)` is a sentence: `=` typed inside them stays where it was typed. Which constructs can hold one is declared per construct rather than decided key by key.
- `Backspace` removes the formula immediately behind the caret as one object, whatever it contains. Inside a slot it deletes normally; at the start of a slot it steps out — into the previous slot, or to just before the formula — leaving the content alone. Only when every slot of a formula is empty does the next `Backspace` remove that formula. `Delete` mirrors all of this forwards. Never more than one thing goes per keypress.
- **A term written straight against a formula gets the multiplication sign nobody typed.** `\frac{1}{3}` then `x` is `\frac{1}{3}\cdot x`; so are `\sqrt{2}10` and `x^{2}10`. Juxtaposition *is* multiplication and it is written that way on paper, but the value leaves this field for something that is not a person — a marking script comparing two answers, or anything evaluating one — and that reader would otherwise have to guess where one term ended and the next began. Only in that direction: a letter or a digit written *before* a formula is left alone, because `2` then a fraction is how two and a half is written and `2\cdot\frac{1}{2}` is not what that means. Only letters and digits, too — `\frac{1}{2}, \frac{1}{3}` is a list and a comma is not arithmetic. And only while typing: a stored value is read back exactly as it was saved, so nothing is rewritten under an answer that was written before this release. The sign is an ordinary character once written; `Backspace` takes the letter, and a second `Backspace` takes the dot.
- A sign typed after a sign replaces it, rather than being written beside it: `1+` then `−` is `1−`. Nobody means `1+−`, and the second press is the correction, so it is treated as one — which is the difference between a student fixing a slip with one key and fixing it with a backspace they have to think about. It applies to `+`, `−`, `:` and `⋅`, whether they come from keys or from the toolbar, and to nothing else: a sign following a digit, a bracket or a whole formula is written as written.
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
demo/           the style laboratory: page, entry, index.html, its own vite.config.ts —
                and capture.tsx, the page the images in this file are photographed from
scripts/        build helpers
docs/images/    the screenshots in this file
vite.config.ts  builds and tests the package — the default config is the product
tsconfig.json   type-checks everything; tsconfig.build.json emits what ships
```

The demo — sliders and colour pickers for the CSS variables above, switches for the toolbar and for `disabled`, and the live LaTeX value — is for developing against and for a first look. It is not part of what ships — `files` in `package.json` is `dist` and the two documents beside it — and `npm run build:demo` puts the site in `dist-demo/` if you want to host it.

| `src/` file | Responsibility |
| --- | --- |
| `registry.ts` | What each construct *is*, declared once: its slots and their order, what it adopts, how it is drawn, how tall it stands, the LaTeX it is written as. Every other file below reads it. |
| `model.ts` | The formula tree: node types, the alternating-array invariant, path arithmetic. |
| `parse.ts`, `serialize.ts` | LaTeX in and out. |
| `caret.ts` | Caret movement over the tree. |
| `reducers.ts` | Every editing operation, as `(row, caret) → (row, caret)`. |
| `render.tsx` | The tree as JSX, with each element tagged by the position it stands for. |
| `selection.ts` | The only code that touches DOM `Range`/`Selection`. |
| `history.ts` | Undo/redo. |
| `speech.ts` | The formula in words, for the description each row carries. |
| `MathInput.tsx` | Props, state, events, and the chrome around the rows. |

`CHANGELOG.md` records what changed in each version, and what is deliberately still open.

Everything but `selection.ts` is pure, and all of it is directly tested — the parser's fallbacks, a round-trip property corpus, caret navigation, every editing behaviour above, and every row of the registry against the same set of properties. Tests also assert the tree's invariant and a valid caret after *every* reduction, so a reducer cannot quietly leave the document in a state the rest of the editor assumes away. `selection.ts` is the one impure module and it has its own suite, jsdom standing in for the browser; what jsdom cannot answer is anything that needs real layout — where a click lands in a line of text — and that is checked in a browser.

## License

MIT © Nikolay Belichuk

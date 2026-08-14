# Changelog

What changed in each version of the component. Versions follow [semantic versioning](https://semver.org); below 1.0 the minor number is where breaking changes land.

## 0.3.1 — 2026-08-14

Documentation only. The component, its build and its published files are unchanged; this release exists so the package page shows the new README.

### Changed

- The README is written for someone using the component rather than someone working on it. It opens with what the field is and a picture of it, and documents every option where you would look for it: props with their types and defaults, then controlled and uncontrolled use, rows as the shape of a worked solution, pinning the tools, and read-only.
- Everything that can be typed is a key-by-key table, every CSS custom property is listed with its default, and the emitted value is shown construct by construct.
- Three screenshots of the running editor, so both npm and GitHub show what it looks like before anyone installs it.
- Accessibility has its own section, including what it does not do yet: a formula's structure is not announced to a screen reader beyond the text inside it.

## 0.3.0 — 2026-08-13

The component becomes a package. It was previously consumed by importing `./src` out of a checkout; it now installs from npm, builds to `dist/` on its own, and is released by pushing a tag.

### Added

- Published as [`@belichuk/math-input`](https://www.npmjs.com/package/@belichuk/math-input). `npm install @belichuk/math-input`, with React 18 or 19 as a peer dependency rather than a dependency of its own.
- ESM and CommonJS builds with source maps, and type declarations generated from the source rather than written by hand.
- The stylesheet ships as `@belichuk/math-input/styles.css` and is imported once by the host. A library build extracts CSS instead of injecting it, so nothing is inserted into the page behind the host's back.
- A release workflow. Pushing a `v*` tag runs the tests, builds the package, publishes it to npm with provenance, and opens a GitHub release whose notes are that version's section of this changelog, with the tarball attached. A tag that disagrees with `package.json`, or that has no section here, fails instead of publishing.

### Changed

- `npm run build` builds the component and nothing else. The demo moved to `npm run build:demo` and `dist-demo/`: it is a style laboratory for developing against and for a first look, and is not part of what ships — `files` is the built package alone.
- `@vitest/coverage-v8` tracks vitest 3 rather than sitting a major version ahead of it. The mismatch made the lockfile impossible to regenerate, which would have failed `npm ci` on the first release.

### Fixed

- Type declarations no longer carry the component's `import "./MathInput.css"`. It resolved to nothing beside the types and would have surfaced as an error for any consumer not setting `skipLibCheck`.

## 0.2.0 — 2026-08-13

The editor is rebuilt on a document model. Each row is now a typed formula tree owned by React state, the caret is a plain `{path, offset}` value, and the contentEditable DOM is a rendering of that tree rather than the source of truth. The previous implementation mutated the live DOM directly and reconstructed the LaTeX by walking it, which meant caret questions had to be answered by comparing DOM boundary points — the source of both caret bugs fixed in 0.1.0, and a class of bug the editor can no longer have: "is this the end of the slot?" is now an array index comparison.

### Added

- `\sqrt[n]{…}`, `x_{n}` and auto-sizing `\left(…\right)` as first-class nodes, editable at any depth like everything else.
- Undo and redo, coalescing a run of typing into one step and breaking the run when the caret moves. The browser's own undo gesture routes into it through `historyUndo`.
- IME and mobile support, neither of which existed before: `beforeinput` and its `inputType` are the primary dispatch point, and the DOM is left to the IME between `compositionstart` and `compositionend`.
- `autoHideToolbar`, defaulting to `true` — the existing behaviour of showing a row's tools only while it has focus. Set it to `false` to pin them to the row the caret last sat in, falling back to the first row so a fresh editor still shows them.
- A keyboard policy: a key that is part of writing a formula stops at the component, press and release alike, so a page that opens search on `/` or steps a carousel on `←` does not act on a formula being typed. Keys the editor has no use for are untouched — `Tab` still moves focus and `Ctrl`/`Cmd`+`S` still reaches the application.
- `Escape` leaves the field. It is taken like every other key, so a dialog around the editor closes on the second press rather than the first.
- A scrollbar for rows whose formula outgrows them, drawn over the field so it costs no height, and draggable without moving the focus or caret of the row being edited.
- The project's first tests: `vitest`, and 122 of them over the model, parser, serializer, caret arithmetic and every editing operation. Each reducer result is also checked against the tree's invariant and for a valid caret, so a reducer cannot quietly leave the document in a state the rest of the editor assumes away.

### Changed

- **Powers and subscripts own their base.** `10^{2}` is a single object that can be selected, deleted or made into a numerator whole, and the two nest, so `x_{i}^{2}` is a power whose base is a subscript.
- **A formula opened in front of written work wraps it.** With the caret at `1/2+|10`, typing `(` gives `\frac{1}{2}+\left(10\right)` with the caret after the `10` and still inside the brackets. Roots and fractions do the same, a whole formula included; only the one term in front of the caret is taken.
- **`=` comes out to the row.** Typed deep inside `\frac{1}{\frac{1}{2}}` it lands after the outer fraction, so an equation is always written between whole formulas. It previously left only the innermost one.
- **Multiplication is a dot**: shown as `⋅` and written as `\cdot`. `*`, `×` and `\times` are all still read, and all come back out as `\cdot`.
- **The toolbar**: the nth root button is now a cube root, inserting `\sqrt[3]{}` with the caret in the radicand; the subscript button is gone. Both constructs are still fully supported — subscripts are written with `_`, and `\sqrt[n]{…}` is read, edited and written back, it is simply not what a button inserts.
- The field opts out of writing-assistant extensions. React owning the children of a contentEditable makes injected nodes a real hazard in a way it was not before.
- Native listeners are down to the three that cannot be React props: `keydown` and `keyup`, because React attaches at the root of the host's tree and a synthetic `stopPropagation` runs only after the event has passed every ancestor below it; and `beforeinput`, whose synthetic version carries no `inputType`.

### Fixed

- Backspace at the start of a slot whose siblings still hold content steps the caret out, instead of doing nothing.
- A selection spanning two slots really deletes, trimming each slot and keeping the formula — half a fraction is not a thing.
- A row no longer changes height when its formula outgrows it. A native scrollbar takes its own height out of the row, which made a row grow by 11px and shrink again on the next backspace.
- The placeholder no longer pushes the caret's text run onto a second line, and clicking past a formula's edge continues after it rather than landing inside its last slot.

### Known limitations

- Paste is flattened to plain text rather than parsed, though the tree now makes parsing it tractable.
- A formula immediately behind the caret is deleted whole by one Backspace rather than being stepped into.
- Backspace at the very start of a row does not merge it into the row above.
- IME composition now goes through React's composition events and has not been exercised with a real input method.

### Notable decisions

- **Empty text runs render a zero-width character.** Measured in Chrome: a range inside an empty element has no client rects at all, so the caret cannot go there. This is the structural replacement for the old invisible anchor character — a function of the tree rather than DOM stitching.
- **Every `FormulaNode[]` strictly alternates** text run, node, text run. That single checkable rule is what guarantees there is always somewhere for the caret to sit on either side of a formula, and it is enforced in one place rather than at call sites.
- **Native selection gestures stay native.** `Shift`+arrows, double-click and Select All are read back on `selectionchange` rather than each being given a reducer action.
- **`\cdot` always takes a trailing space.** Whatever follows may be a letter living in an entirely different node, such as the base of `x_{i}`, and `\cdotx` is not a command. The round-trip property test caught this on its first run.

## 0.1.0 — 2026-08-12

The original component: a dependency-free React editor for square roots, fractions and powers, emitting KaTeX-compatible LaTeX, with a demo page and a styling contract of `--math-input-*` CSS custom properties (replacing an earlier Tailwind dependency).

Its editing worked by mutating the live contentEditable DOM, with an invisible anchor character stitched in after every formula so the caret had somewhere native to land. Two caret bugs were fixed in this line — arrow navigation out of any slot holding a single text node, twice — both of which came from comparing DOM boundary points that describe the same visual position but are not equal to the DOM. That is what 0.2.0 was written to remove.

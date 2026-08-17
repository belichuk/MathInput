# Changelog

What changed in each version of the component. Versions follow [semantic versioning](https://semver.org); below 1.0 the minor number is where breaking changes land.

## Unreleased

Work in hand for the next release. The release workflow takes a version's notes out of this
file and refuses to publish a version that has none, so this section exists from the first
commit of a release rather than being written at the end of it.

Two halves. Everything about how the field *works* — how it is built, what a keystroke costs,
how much of it there is — changed without changing what it does at all. Everything about how
a formula *looks* changed a great deal, and deliberately: operations are spaced, letters are
italic, digits upright, a minus is a minus, and roots are weighed by what they cover. Writing
a formula is what it always was; reading one should now look like mathematics.

### Changed

- **A construct is a row in a table now, not knowledge spread across seven files.** What a fraction *is* — its slots and their order, which of them a term written in front of it becomes, where the caret lands when it opens, how many lines of writing it stands, what the stylesheet calls each slot, and the LaTeX it is written as — was stated in seven places, and adding a construct meant editing all of them with nothing to say when one was missed. It is stated once. Traversal, normalisation, path comparison, range deletion, rendering, height, styling, insertion policy and serialisation all read that one table, and the typed union survives it: a row that names a slot its own construct does not have is a compile error rather than a caret that goes nowhere. Nothing about the editor behaves differently — that was the requirement, and all 189 tests from before it pass unchanged.
- **A keystroke costs the browser one layout instead of three, and the same one whether the editor holds one row or fifty.** The caret and the ornaments were drawn by two effects that between them read the page, wrote it, and read it again — and the scroll indicator was redrawn for *every* row on an edit that could only have changed one, asking each of them for its width three times over. They are one pass now, which reads everything it needs and then writes everything it has to: 11 layout reads in 1 forced layout, against 15 in 3 for a one-row field and 358 in 52 for a fifty-row one. Rows that change size for reasons other than editing are still followed, by the resize observer, which is where that belongs.
- **A keystroke in a fifty-row worksheet is roughly eight times faster.** Two things were doing work proportional to the whole document for an edit that was proportional to nothing. Each row is now a memoised component, so an edit re-renders the row it touched and leaves the rest alone — the dividend the immutable tree has always been paying and never collecting. And the LaTeX handed to `onChange` is remembered against the tree that produced it, so rewriting a document means rewriting the path that changed rather than every row in it.
- **1.2 KB smaller, gzipped.** The published ES bundle was minified but *pretty-printed* — 1,508 lines of it, a fifth of the file — because a bundle's own output setting is separate from the build's, and only the latter had been raised. Worth recording that the 0.3.3 notes were right that forcing esbuild makes the file 3% *larger*; the observation was sound and only the conclusion drawn from it was wrong. The fraction icon is now drawn from the bar and rings the other icons already use rather than from a 494-byte outline of the same picture, and the icon table is built once instead of once per button per render.

- **Operations are set with space around them.** `2+3` was one run of ink; it is `2 + 3` now, with the amounts mathematics has always used — a medium space either side of a binary operator, a thick one either side of a relation. A font cannot do this and neither can a stylesheet on its own, because whether a given `+` is an operation at all depends on what stands in front of it: the minus of `-b` is a negative and takes no space, while the minus of `b^{2}-4ac` is a subtraction and does. A run is split either side of the signs that are operations and left as one piece when there are none, so the overwhelming majority of runs are drawn exactly as before. `--math-input-operator-space` and `--math-input-relation-space` set the two amounts. Nothing about the document changed: the model, the LaTeX and every offset in it are what they were.
- **A root's index sits where it belongs** — a small superscript at the top left of the radical, kerned in against the rising stroke, rather than adrift below and to the left of it. How far in it kerns follows the root's width, because this radical is one drawing stretched to the height of its radicand: its stroke leans further right the taller it stands, so an index tucked in by a constant would touch the sign on a short root and float away from it on a tall one.
- **Letters are set italic and digits upright**, which is the oldest convention in mathematical setting and the one that says at a glance which `2` in `x2` is the number. Figures are tabular, so a column of working lines up. A run that is all one class carries it on the run itself and keeps its single text node, so `x` and `12.5` cost no more to address than they did before any of this.
- **A minus is drawn as one.** A keyboard has a hyphen and mathematics has a minus, and they are different characters: U+2212 is drawn to the width of a plus and sits at the same height, where a hyphen is short, low, and reads as a word-break. Only the drawing changes — the model keeps the hyphen that was typed, the LaTeX is unchanged, and every offset still counts the same characters. A minus pasted in from elsewhere becomes the hyphen, so a document only ever holds one of the two.
- **A script two levels down stops shrinking.** `0.72em` on each script compounded, so `x^{y^{z^{w}}}` in a 24px field was setting text at 6px. Scripts follow the ladder TeX uses — full size, 0.72, 0.55 — and then hold, and never go below 11px however small the field is.
- Radicals stand a little lower over what they cover, which is closer to how the same expression is set anywhere else.
- **One thickness for every rule the component draws.** A fraction's bar was 1.5px and did not change when the field's font size did; it is the same value the bar over a radicand and the radical's own stroke are drawn from, floored at a pixel so a hairline never rounds away to nothing. Hook and vinculum are that value exactly, which is what makes them one line where they meet; a radical carries rather more of it than a fraction bar does, because this one is drawn at a single thickness throughout where a typeset radical is a glyph that thickens along its diagonal.
- The radical overlaps the bar it runs into by half a pixel. Two edges that merely meet round to either side of the same device pixel on a fractional display, and leave a hairline of background showing between them.
- An index nobody has written yet is still somewhere to tap.
- **A radical's weight is a function of what it covers, rather than one of three sizes chosen between.** It came in three, picked by two thresholds, and a threshold shows: two roots a hair apart in height were drawn in visibly different weights, while every root between one and a half lines and two and a third was drawn as though it were exactly two. Both the stroke and how far the radical reaches before its bar begins now grow smoothly with the height of the radicand — read off the tree, never measured off the page — and both stop growing, because a root over a page of working is a tall radical and not a thick one. The index's drop down the stroke comes from the same height, which is what holds the gap between index and radical at one constant distance from a square root over a digit to a cube root over a stack of fractions. It was three hand-set offsets before, one of them a guess at a size nothing exercised.

- **↑ and ↓ do something.** They were not handled at all — not even stopped at the frame, so they reached the page. They move between the slots a construct stacks, asking the nearest one first: ↓ from the numerator of a fraction inside an exponent finds that fraction's denominator rather than leaping out to the power's base, and ↓ again from the denominator does leave for the base. Which slot is above which is declared per construct rather than guessed at. When nothing around the caret stacks anything, the row above or below answers. Where the caret lands is arithmetic on offsets — as far along the new slot as it had come along the old one, and no further — because a column carried from the caret's position on screen would be an editing decision made by measuring the page, which this editor does not do.

- **The slot the caret is in is shown.** On a formula of any depth the hard question is *which box am I writing in*, and a caret is a thin line in a field full of them. The slot under it is marked now — written onto the element by the caret pass rather than rendered into it, so it costs no re-render at all, which matters because the answer changes on almost every keystroke and re-rendering the row to say so would undo what makes a keystroke cheap. Rendering stays a pure function of the document, since the document does not know where the caret is.
- **Pasted LaTeX arrives as a formula rather than as its own source.** `\\frac{1}{2}` pasted into a row becomes a fraction with slots the caret can be moved around inside, because `parse.ts` is a tolerant reader and this is exactly what it was written for. Text with no structure in it is written literally, the way typing writes it. Worth being plain about one thing the plan expected here: `1/2+3` is *not* LaTeX, whatever the `/` key does when pressed, so it pastes as the six characters it is.

- **A formula is written *around* a selection rather than over it.** Select `x+1`, press `/`, and it becomes the numerator with the caret waiting in the denominator; press the root button and it becomes the radicand. Every one of those used to delete what was selected and insert an empty formula, which is the one thing a selection is least likely to have meant. Where the caret goes afterwards is the first slot still waiting to be written. A selection that runs from inside a formula to somewhere outside it is still replaced: half a fraction is not a term, and there is nothing sensible to write around it.
- **`=` comes out only as far as it has to.** It always came out to the row, so `(x` then `=` wrote `\\left(x\\right)=` — the relation pushed outside the brackets it was typed in. A relation now leaves whatever cannot hold one, a numerator or a radicand or an exponent, and stops at the first thing that can: `\\left(x=1\\right)` is a sentence and stays where it was written. Which constructs can hold a relation is declared per construct, settled now rather than when inequalities ship, because a construct that has already decided this cannot change its mind without breaking what people wrote.

- **`Tab` walks the boxes of a formula.** It used to pass straight through. It now moves to the next slot in the order they are drawn — open a fraction, write the numerator, `Tab`, write the denominator — landing at the start of a slot with nothing in it and the end of one already written in. **This is a change to a documented contract:** a host that relied on one `Tab` always leaving the field may now need several. With no slot left in that direction `Tab` is not taken at all and focus leaves as before, so the field is never a keyboard trap (WCAG 2.1.2), and `Esc` still leaves in one press. The set of keys the editor contains is now written out in the README as the contract it is.

### Removed

- **Six radical custom properties are two, and one of those is now about every rule.** `--math-input-rule` sets the thickness of a fraction's bar, the bar over a radicand and the radical itself; `--math-input-root-width` sets how far a radical reaches before its bar begins, over a single line of writing.
- **The old six.** `--math-input-root-stroke-s`, `-m` and `-l`, and `--math-input-root-width-s`, `-m` and `-l`, named three sizes that no longer exist. `--math-input-root-stroke` and `--math-input-root-width` replace them and set the radical over a *single line* of writing; every taller root is scaled from there. A host that set three weights by hand now sets one and gets the whole range in proportion.

### Added

- Measurement, as a gate rather than a note. `npm run size` prints what each artefact weighs against a budget and fails over it, and it fails too if the package ever acquires a runtime dependency or if anything belonging to the demo — KaTeX, which the reference page below uses — finds its way into the bundle. CI runs it on every commit.
- `npm run bench`, which counts what a keystroke costs in layout rather than timing it: the accessors the code reads the page through are wrapped and counted in order, so *reads after a write* — the ones a browser has to lay the page out again to answer — are counted separately from reads that are free. The number is exact, identical on every machine, and asserted in the ordinary test suite over three fixtures: a two-character answer, a fifty-row worksheet, and one row eight constructs deep.
- A typography reference page in the demo, `katex-reference.html`: 36 expressions drawn by the component beside the same LaTeX set by KaTeX, with a control that superimposes the two so a difference of a pixel is visible. KaTeX is a devDependency of the demo and nothing else.
- Tests for the DOM bridge, which had none — the seam the whole editor rests on, and the one place a mistake is invisible from either side.

## 0.3.7 — 2026-08-16

Roots. The radical was one drawing at one size, ruled over whatever it was given;
it is drawn to the height of what it covers now, in the weight that height asks
for, with its bar continuing the same stroke.

### Changed

- Square roots and cube roots are drawn to fit what they cover. The radical was a fixed drawing an em and a half tall with a bar across the top, which suited a digit and nothing else: over a fraction it was a small tick beside a tall stack, and over a stack of fractions it was barely there. It is now drawn to the exact height of its radicand — stretched, never re-proportioned, with a stroke that keeps its width while the box changes shape — and it comes in three weights, chosen from the tree by how many lines of writing the root has to cover: over a number, over a fraction, over anything deeper. Each root is weighed by its own radicand, so a root inside a root is visibly the heavier of the two.
- The bar over a radicand is that slot's own top border, so it spans exactly what is written under it, however wide; and it is the radical's stroke rather than a width of its own, drawn in the same band, so the two are one line by construction at any size and in any font. `--math-input-root-stroke-s`, `-m`, `-l` set the weights and `--math-input-root-width-s`, `-m`, `-l` how far the radical reaches before its bar begins.

### Fixed

- A divider left at the end of a wrapped toolbar line divided nothing: what it stood between was on the line below, which already separates them. Those are hidden, and only those — a divider whose group shares its line stays. Hidden rather than taken out of the flow, because removing one would give the line back the room that made it wrap, and the two would take turns undoing each other every time the field was resized.

## 0.3.6 — 2026-08-16

The toolbar. It could build a square root but not write a plus, which is half of
what a worked solution is made of and all of what a tablet with no keyboard can
reach. It now carries the signs and the caret as well as the formulas, and a sign
typed after a sign corrects it rather than piling up beside it.

### Added

- The toolbar carries the four operators — `+`, `−`, `:` and the multiplication dot — and the two arrows that move the caret, in three groups with a divider between them: the formulas that have to be built, the characters that only have to be written, and moving about. A formula is written on a tablet as often as on a keyboard, where none of that was reachable. Every button dispatches the action its key dispatches, so the dot is still emitted as `\cdot`, and each group wraps as a whole when the field is too narrow for one line.
- A sign written straight after another takes its place instead of standing beside it: `1+` then `−` is `1−`, `1−` then `*` is `1⋅`, from a key or from the toolbar. Two signs in a row are a slip rather than a formula, and the second press is nearly always the correction — so correcting one costs a keystroke rather than a backspace the writer has to think about first. It is only sign for sign: after a digit, a bracket or a whole formula the sign is written as it is, so a minus opening a row, a bracket or a slot is the negative it always was, and a multi-character insertion — a paste — is left alone.
- `showOperators` and `showNavigation`, both `true`, drop either of those groups — and the divider that went with it — for a field that does not want them. The formulas have no switch of their own: building those is what a toolbar is for.

### Changed

- The fraction tool is titled "Fraction" rather than "Divide", now that a division sign sits two buttons along from it.

## 0.3.5 — 2026-08-16

The space bar. A formula carries no whitespace, so the key was dropped on the floor; it now moves the caret past what is in front of it, which is what a formula being written needs it for. Two things it turned up on the way are fixed with it: a power that opened at a slot nobody could write in, and a root that gave no sign the caret had left it.

0.3.4 was never published; this work is released as 0.3.5.

### Added

- The space bar moves the caret past whatever is in front of it rather than being ignored: the rest of what is being written, then over a whole formula standing next to it, then out of the slot — one thing per press. A slot left this way hands the caret to the end of the next one, so `\frac{1|}{2}` goes to `\frac{1}{2|}` and the press after that leaves the fraction, while `\sqrt{9|}`, `x^{2|}` and `\frac{1}{2|}` all step straight out. Typing a fraction and carrying on no longer needs the arrow keys. Nothing is written by the key, and whitespace still never reaches a formula: a pasted space is dropped as before.

### Fixed

- The power tool left the caret in the exponent even when it had taken no base, so a power pressed on an empty row — or after an operator — opened at a slot that could not be filled in: the base was unreachable without the arrow keys, and a term written in front of the caret went into the *exponent* rather than becoming the base. A power with nothing behind it now opens at its base, which is the same rule `/` already followed with nothing in front of it. A power that does take a term behind the caret is unchanged, and so is the `^` key.

### Changed

- The demo reads top to bottom as one story: the field, the raw LaTeX it emits, then the component code. `disabled` joins the field controls, so read-only is something to try on the field itself rather than a second field to look at, and the generated code carries the prop like the rest of the settings. The keyboard log is gone; it demonstrated the capture-phase escape hatch, which the README now describes in a line of code instead. The headline sits on one line.
- A little more room on either side of a root. The radical's bar overhangs a short radicand, so a caret that had just left the root stood against the end of that bar and read as still being under it — leaving a root looked like nothing had happened. The gap is where the caret now stands to show it is out, and it applies however the root is left: `Space`, `→`, or a click.

## 0.3.3 — 2026-08-14

Documentation and repository layout. The published `dist/` is byte-for-byte what 0.3.0 shipped; this release exists so the package page carries the documentation.

### Changed

- The README is written for someone using the component rather than someone working on it. It opens with what the field is and a picture of it, and documents every option where you would look for it: props with their types and defaults, controlled and uncontrolled use, rows as the shape of a worked solution, pinning the tools, and read-only.
- Recipes for what comes after the first render: a form — `Enter` adds a row and never submits, so the button matters — loading and clearing, showing an answer without letting it be edited, and a page of fields.
- Everything that can be typed is a key-by-key table, every CSS custom property is listed with its default, and the emitted value is shown construct by construct.
- Size, measured rather than claimed: 11.9 kB of JavaScript and 2.0 kB of CSS, gzipped, with React external. There is nothing to tree-shake off a single-entry component, the build is already minified — forcing `minify: "esbuild"` over the default makes it 3% larger — and the tarball is bigger than any of it only because of the CommonJS build, the maps and the types, none of which reach a user.
- What each framework needs: `"use client"` under Next, nothing for the usual bundlers, and for Jest a CSS stub only if your own code imports the stylesheet.
- Browser support, including a trap worth knowing before it bites: rows are identified with `crypto.randomUUID`, which browsers only expose in a secure context, so a plain `http://` LAN address used to test on a phone will not do.
- Accessibility has its own section, including what it does not do yet: a formula's structure is not announced to a screen reader beyond the text inside it.
- Three screenshots of the running editor, so npm and GitHub both show what it looks like before anyone installs it.
- The repository root is about the package now: `vite.config.ts` builds and tests the component, and everything the demo needs — its `index.html`, its entry and its own Vite config — lives in `demo/`. `tsconfig.json` type-checks the whole repository rather than `src` alone, so the demo and the config files are covered too, and `npm run typecheck` runs it in CI.

0.3.1 and 0.3.2 were never published; this work was written under the first of them and released as 0.3.3.

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

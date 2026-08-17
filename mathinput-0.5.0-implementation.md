# MathInput 0.5.0 — comprehensive implementation plan

> **Status:** ready to execute. Written 2026-08-17 against commit `a425251` on branch
> `release/0.5.0-registry`, package version `0.3.7`.
>
> **Audience:** an implementer with no memory of the conversation that produced it. Everything
> needed is either in this document or named by `file:line`.

---

## Part I — Context

### 1.1 Where this document comes from

Three documents precede this one, in order:

1. **`architecture.md`** (662 lines) — an abstract description of the component, deliberately
   written with no filenames or identifiers, so it could be handed to a reviewer who has no
   access to the repository.
2. **`request-plan.md`** (151 lines) — the review brief. Four ranked priorities: bundle size,
   runtime performance, UI/UX with the keyboard above all, and the public API's naming.
3. **`mathinput-review-plan.md`** (243 lines) — the blind review's answer: findings B1–B6,
   F1–F6, U1–U9, A1–A6, G1–G3, plus a seven-stage plan and ten rejected alternatives.
4. **`mathinput-0.5.0-plan.md`** (425 lines) — a design for 0.5.0 built on that review: a
   construct registry, seven layout primitives, typography, a completed keyboard, accessibility.

**This document is the fifth and the executable one.** The 0.5.0 design is sound in its
direction, but it was written without code access and several of its premises turned out to be
false. Part II records what was verified; Part III onwards is the work.

### 1.2 The theme, unchanged

**Stop hard-coding constructs; make them declarations.** Today, knowledge about "what a fraction
is" is spread across seven files. Adding a construct means editing all of them. After 0.5.0,
adding a construct should mean adding a row to a table — and if it doesn't, that is a bug in the
design, not a workaround to write.

The freedom that buys is then spent on: new constructs, real mathematical typography, a keyboard
a student can use without a mouse, and a screen-reader story that currently does not exist.

### 1.3 Decisions already taken

These were decided by the user during planning and are **not** open:

| # | Decision | Consequence |
|---|---|---|
| D-1 | **One release.** Everything folds into 0.5.0; no intermediate 0.4.x | The diet and perf work become M1 of this plan rather than a prior release |
| D-2 | **Registry as a declarative table, keeping the typed union** — not generic `Record<string, Sequence>` slots | Preserves TypeScript exhaustiveness on the five existing kinds; indexed families (matrices) deferred to 0.6.0 |
| D-3 | **Behaviour wins over bytes** where the two conflict | Nothing gets cut to hit a size number; the number moves instead (see §2.6) |
| D-4 | **Tab walks slots**, exiting the field at the row's last slot | Breaks a documented contract; README and a11y docs must change with it |

---

## Part II — Ground truth

### 2.1 The codebase as it actually is

`src/`, 11 runtime files + 7 test files. Line counts and roles:

| File | Lines | Role | Per-construct knowledge? |
|---|---|---|---|
| `model.ts` | 184 | Node types, `Path`, `encodePath`/`decodePath`, `normalize`, `resolve`, `comparePaths` | **Yes** — `branchesOf` (`:47`) is the master slot table |
| `caret.ts` | 124 | Caret walking: `startOfArray`, `enterNode`, `exitForward`, `skipForward`, `clampPosition` | **No** — zero construct names in the file |
| `reducers.ts` | 346 | The pure editing core: an 11-member `Action` union | **Yes** — ~7 sites, mostly insertion policy |
| `parse.ts` | 133 | Tolerant LaTeX → tree reader | **Yes** — 6 sites |
| `serialize.ts` | 22 | Tree → LaTeX writer | **Yes** — one 5-arm switch |
| `render.tsx` | 121 | Tree → JSX, stamping `data-path` on every element | **Yes** — 3 tables/switches |
| `selection.ts` | 162 | The DOM bridge: model position ↔ native selection | No |
| `history.ts` | 38 | Undo/redo, 200-snapshot cap | No |
| `MathInput.tsx` | 565 | The whole imperative shell: state, keyboard, toolbar, effects | **Yes** — 2 sites |
| `MathInput.css` | 470 | 52 rule blocks, 27 custom properties | — |
| `index.ts` | 2 | **Single entry point** — exports `MathInput`, `MathInputProps` only | — |
| `testing.ts` | 26 | Test helpers, incl. `sketch()` which renders LaTeX with `|` at the caret | — |

### 2.2 The invariants (from `architecture.md` §9) — all five must survive

1. Every sequence alternates literal runs and constructs, starting and ending with a run.
2. Every caret position names a literal run; constructs are entered, never landed on.
3. The document is only ever changed by a reducer, and only through the single dispatch path.
4. **No editing decision is made by measuring or comparing anything on the page.**
5. Rendering is a pure function of the document.

Invariant 4 is the one most at risk in this release (vertical arrows, height estimates,
active-slot highlight). Every design below is chosen to keep it.

### 2.3 Corrections — claims in the prior documents that are false

Each was verified in code. **Do not plan around the original claims.**

| Claim | Verified reality | Where |
|---|---|---|
| Review Stages 1–2 "assumed done or bundled here" | **Nothing landed.** No `memo`/`useMemo`/`React.memo` anywhere in `src/`. Tags stop at `v0.3.7`. The "Stage 0–4" commits in the log are the *0.2.0 tree rewrite*, unrelated | `git log`; grep |
| B1: minification saves −1.4 KB gz | **Confirmed ≈ −1.25 KB.** Measured: `dist/math-input.js` 43,552 raw / **12,846 gz**; re-minified 33,022 / **11,564 gz**. But `CHANGELOG.md:65` claims forcing `minify:"esbuild"` makes it *3% larger* — the saving is real, the **config route is unknown** | measured |
| B2: stroke-drawn icons save 1.0–1.4 KB gz | **Arithmetically impossible.** Total path data is **2,380 bytes raw** across 10 strings, and the small glyphs are *already* strokes (22–30 B each). Only `remove` 648 B, `frac` 494 B, `LETTER_X` 346 B are real outlines. Realistic ceiling ≈ **0.5 KB gz** | `MathInput.tsx:37–66` |
| F5: stamp runs only, drop compound `data-path` | **Would break clicking.** `beyondFormula` reads `data-math` *and* `data-path` off compound ancestors to implement "click past a formula's edge means carry on after it". The reviewer marked this `[confirm]`; the answer is **no** | `selection.ts:99–114` |
| "The 154 existing tests must keep passing" | **False for selection wrapping.** Two tests assert the *opposite* of the planned behaviour: `"replaces a selection with an empty fraction"` expects `\frac{|}{}`, and `"deletes the selection and inserts an empty formula, rather than wrapping it"` says so in its name | `reducers.test.ts:101, :151` |
| The registry makes traversal generic | `caret.ts` contains **zero** per-construct code already. The registry's real payoff is in `parse.ts` + `serialize.ts` (two independent inverse implementations) and the insertion policy | `caret.ts` |
| "Per-row memoisation", "O(rows)" | **Both real and well-founded.** Each row is its own `contentEditable` with `role="textbox"`; rows are independent immutable trees keyed by `row.id`; `dispatch` replaces one row and shares the rest by reference | `MathInput.tsx:30, 217–227, 508` |
| `architecture.md` §10 says 29 custom properties | **27 declared** (`:2–28`). `--math-input-max-width` is referenced at `:31` but never declared — it works off its `48rem` fallback alone. (A4 confirmed) | `MathInput.css` |
| Named functions = "name datum + argument slot" (review) vs "zero-slot atom" (0.5.0 plan) | The two documents **contradict each other**; unresolved. See Q-3 | — |

### 2.4 Findings neither prior document contains

These were discovered during verification and are genuine work items:

- **`EditorIcon` rebuilds the entire 13-glyph object literal — every path string — on every icon
  render** (`MathInput.tsx:48–66`). With 11 tools plus two row buttons, that is ~13 full table
  constructions per toolbar render. Free win: hoist to module scope.
- **Layout reads per keystroke are `2 + 7R + 3D`**, not "at least two". On a one-row editor with
  two dividers that is **~15 reads in ≥3 read→write→read cycles**. Breakdown: caret
  scroll-into-view 2 (`selection.ts:140,142`); `syncScrollbar` 7 per row (`MathInput.tsx:176–179`)
  with 2 interleaved style writes; `syncDividers` 3 per divider (`:198`) with 1 interleaved write.
  Both ornament passes run from one unconditional layout effect with **no dependency array**
  (`:291`), so they fire on every render of every row, focused or not.
- **Row semantics are thinner than `architecture.md` §7 implies.** `createRow` (`:246`) *always
  appends to the end* — it does not insert after the current row and does not split the current
  row's content at the caret. Backspace at a row's start does **not** merge into the previous row.
  ↑↓ are not handled at all and are not even `stopPropagation`ed.
- **`selection.ts` and `history.ts` have no test files.** Test distribution: reducers 67, model 28,
  caret 21, parse 14, render 12, serialize 7, **toolbar 5**. The shell is 41% of the bundle and
  the riskiest refactor target, and is effectively untested.
- **No bundle-size check and no benchmark in CI** (`.github/workflows/ci.yml` runs typecheck →
  test → build → build:demo only).
- **`release.yml` extracts the tagged version's CHANGELOG section via awk and fails if it is
  empty** (`:52–63`). There is no `## Unreleased` section — tagging `v0.5.0` today would fail.
- **Tags `v0.3.5`, `v0.3.6`, `v0.3.7` exist locally but were never pushed**; npm has 0.3.0 and
  0.3.3. Unrelated to this plan but must be resolved before any 0.5.0 release.
- `model.ts:19` exports `type Row` that nothing imports — dead, duplicated at `MathInput.tsx:30`.
- `TRAILING_TERM` is duplicated (`parse.ts:7`, `reducers.ts:162`) — **two independent adoption
  implementations**, one for typing and one for parsing.
- The `CARET_PLACEHOLDER` U+200B (`render.tsx:16`) is part of the field's accessible content and
  is not hidden from assistive tech.

### 2.5 Inventory of per-construct knowledge (what the registry must absorb)

This is the checklist M2 is measured against.

| Site | What it decides |
|---|---|
| `model.ts:47–56` `branchesOf` | Slot names and **visual order** per kind; sqrt's conditional arity when `index === null` |
| `reducers.ts:197–208` `buildNode` | Which slot receives a captured term |
| `reducers.ts:303–313` | `capture` / `caretBranch` / `emptyCaretBranch` per trigger; `script` detection; `divide` → frac |
| `reducers.ts:326` `closeGroup` | The only reducer testing a concrete node type |
| `parse.ts:83–125` | Six arms: `\sqrt` + optional `[index]`, `\frac`, `\cdot`/`\times`, `(`/`\left(`, `^`, `_` |
| `parse.ts:29–41` `takeTerm` | The parse-side adoption rule (duplicate of the reducer's) |
| `serialize.ts:10–19` | One template per kind, incl. sqrt's `index === null` fork |
| `render.tsx:18–28` `SLOT_MODIFIER` | 9 `kind:branch` → CSS modifier entries |
| `render.tsx:57–68` `linesIn` | Per-kind height model |
| `render.tsx:96–118` `renderNode` | Per-kind JSX and `data-math` |
| `MathInput.tsx:89–120` `TOOL_GROUPS` | Which kinds are tools; `cubeRoot` carries `index:"3"` |
| `MathInput.tsx:127–137` `KEYED_ACTION` | Which characters mean which construct |

### 2.6 The size budget no longer closes — and the recommended resolution

With B2 corrected the arithmetic is:

```
today                                                  12.85 KB gz
  − 1.25  B1 minification            (measured)
  − 0.50  B2 icons                   (corrected from 1.0–1.4)
  − 0.30  B4 module glue             (estimate)
  ------------------------------------------------
  = 10.80  after the diet

0.5.0 additions (all estimates from the 0.5.0 plan §5):
  + 0.30  registry
  + 0.50  layout primitives
  + 0.50  tokeniser + typography
  + 0.60  input v2
  + 0.70  spoken math
  ------------------------------------------------
  = 13.40 KB gz projected      vs the chosen ≤12 KB → over by 1.40
```

The reviewer's 12 KB rested on B2 delivering 1.0–1.4 KB, which it cannot.

**Recommendation — the one place this plan departs from decision D-3's literal number:** enforce
**two** budgets rather than one.

- `full build ≤ 13.5 KB gz`
- `core (toolbar-free) entry ≤ 10.5 KB gz`

This keeps D-3 true in substance — **nothing is cut** — while still holding a hard CI ceiling and
making the toolbar-free entry (review finding B3) a real deliverable rather than an aspiration.
The alternative that preserves 12 KB is moving the spoken-math writer to an opt-in subpath, which
trades away the accessibility default. **Not recommended.**

If the implementer is told to hold 12 KB regardless, the order to cut is: (1) make spoken math
opt-in, (2) drop the `grid` primitive stub, (3) defer typography's tokeniser to 0.6.0.

---

## Part III — Open questions for the reviewer

Four block specification work. Four do not. **M0 and M1 depend on none of them**, which is why the
plan front-loads them.

### Blocking

**Q-1 — What is the concrete shape of `ReadRule` and `WriteRule`?**
This is the load-bearing unknown of the entire release. `parse.ts` and `serialize.ts` are
independent inverse implementations, and the parser must handle optional arguments
(`\sqrt[i]{r}`), paired stretchy delimiters (`\left(…\right)`), and `^`/`_` **adoption from the
token stream** (`parse.ts:117–125` calls `builder.takeTerm()`). A declarative rule that expresses
all three without collapsing back into a switch is the bet the registry makes.
*Ask for: the concrete TypeScript type, plus the `root` and `pow` rows written out in full.*
*Fallback if unsatisfying:* leave `parse.ts` as a switch, declare `write` only, and record it as a
known limit. A registry covering four of five layers is still worth shipping.

**Q-2 — How does run tokenisation coexist with the caret bridge?**
0.5.0 §3.4 splits a run into several classed spans (variable/number/binary-op/relation). But
`positionFromDom` (`selection.ts:42–59`), `applySelection` and `repairField` (`:156–162`) all
assume **one run = one `data-path` element = one text node**, and offsets index into that node.
The plan says "no model change, fully testable without a DOM" and never mentions the bridge.
*Ask for:* nested spans **under** the addressed run element with the offset walked across
children, or a different scheme? Who owns the offset→(child, offset) mapping?

**Q-3 — `opname`: zero-slot atom, or name-datum plus argument slot?**
The review says "compound carrying a name datum + argument slot"; the 0.5.0 plan says explicitly
zero-slot, arguing `\sin x` is legal LaTeX and composition is cleaner. They contradict. Also
unresolved: `serialize.ts` emits no separating space, so `\sin` followed by a bare `x` would
serialise as `\sinx`, which is not valid LaTeX. (Precedent exists: `TIMES` serialises as
`\cdot ` **with a trailing space**, `serialize.ts`.)

**Q-4 — Where does token-revert state live?**
"Backspace immediately after recognition reverts to the literal characters" (0.5.0 §4.3) requires
transient state remembering that the last edit was a recognition. Invariant 3 says only reducers
change the document, and the core is pure. In `RowState` (visible to undo, must not leak into
serialisation), or in the shell (breaks the single-dispatch story)?

### Non-blocking — decide in flight, but their opinion is worth having

**Q-5 — Address v2 grammar.** The plan proposes `2d0` (one-char slot codes) and `4#7.0` (indexed
cells). Needs an exact grammar: multi-digit indices, the separator between an index step and a
slot code, and nesting. **Note the premise weakened:** compounds must keep an address (§2.3, F5),
so shortening buys less than the plan assumed. It may not be worth the churn in 0.5.0 at all.

**Q-6 — Row semantics.** ↑↓ "else previous/next row" assumes rows behave sensibly. They don't:
`createRow` appends at the end, never splits at the caret, and Backspace never merges rows. Is
fixing row semantics in scope for 0.5.0, or a separate piece of work?

**Q-7 — Nested fractions don't shrink, but scripts follow the TeX ladder** (0.5.0 §3.2). Is that
inconsistency intended? Does the KaTeX reference harness treat it as a permanently accepted diff?

**Q-8 — Spoken math locale.** English-only strings inline, or externalised from the start? Affects
the ≈0.7 KB estimate and the API.

---

## Part IV — The work

Seven milestones. Each ships behind a green suite, is independently revertible, and has an
explicit acceptance test. **M0 → M1 → M2 is a hard sequence.** M3/M4 may overlap. M5 depends on
M2. M6 is last because the API renames should land once, at the end.

---

### M0 — Measurement harness and baseline *(S, ~1 day)*

Nothing here changes shipped behaviour. Everything after is measured against it.

**Files:** `scripts/size.mjs` (new), `src/bench/keystroke.bench.ts` (new),
`demo/katex-reference.html` (new), `.github/workflows/ci.yml`, `package.json`, `CHANGELOG.md`.

**Steps:**

1. **Size gate.** `scripts/size.mjs`: build, gzip `dist/math-input.js` and `dist/math-input.css`,
   print a table, exit non-zero over budget. Budgets from §2.6. Add `"size": "node
   scripts/size.mjs"` to `package.json` scripts and a step to `ci.yml` after `npm run build`.
2. **Keystroke benchmark.** `src/bench/keystroke.bench.ts` using vitest's `benchmark` in jsdom,
   over three fixtures: a two-character answer, a 50-row worksheet, an 8-deep nested expression.
3. **Forced-layout counter.** Rather than DevTools tracing, monkey-patch the accessors the code
   actually uses — `offsetTop`, `offsetHeight`, `scrollWidth`, `clientWidth`, `scrollLeft`,
   `Element.prototype.getBoundingClientRect`, `Range.prototype.getBoundingClientRect` — and count
   calls per dispatched keystroke. Deterministic, cheap, and runs in CI.
   **Assert the current baseline `2 + 7R + 3D`** so the harness is proven correct before M1
   changes it.
4. **KaTeX reference page.** `demo/katex-reference.html`: ~30 corpus formulas rendered by the
   editor beside the same LaTeX rendered by KaTeX. Every *(starting value)* in the 0.5.0 design
   gets tuned against this. **KaTeX goes in `demo`'s devDependencies only — it must never enter
   the package** (the no-dependency constraint).
5. **Unblock the release.** Add `## Unreleased` to `CHANGELOG.md` so `release.yml`'s awk
   extractor cannot fail at tag time.

**Acceptance:** CI prints and enforces a size number; `npm run bench` reports a layout-read count
matching the predicted formula on all three fixtures.

---

### M1 — Diet and hot path *(S–M, ~2–3 days; no behaviour change)*

Everything the review called Stages 1–2, with B1/B2 corrected. **All 154 existing tests must pass
untouched** — this milestone changes no semantics whatsoever.

**Files:** `vite.config.ts`, `MathInput.tsx`, `serialize.ts`, `model.ts`, `parse.ts`,
`reducers.ts`.

**Steps:**

1. **Settle the minification contradiction.** `CHANGELOG.md:65` claims the build is already
   minified and that forcing esbuild makes it larger; measurement says 11,564 gz is achievable
   against today's 12,846. Try, measuring each: `build.minify: "esbuild"`, `build.minify:
   "terser"` with `compress`/`mangle`, an explicit `build.target`, and
   `esbuild.legalComments: "none"`. Note the CJS output is *already* 33,528 raw against ESM's
   43,552 — the ESM emit is the pretty-printed one, which is a strong clue. **Target: −1.25 KB.**
2. **Icons.** Hoist the `Glyph` record out of the `EditorIcon` function body to module scope
   (`MathInput.tsx:48–66`) — an allocation win independent of size. Then redraw `remove` (648 B),
   `frac` (494 B) and `LETTER_X` (346 B) as strokes if visual review passes. **Target: −0.5 KB.**
3. **One forced layout per keystroke.** Merge the caret effect (`:281–286`) and `syncFrame`
   (`:291`) into a **single** layout effect structured as a strict read phase then write phase:
   ```
   READ:  caret rect, field rect, focused row scrollWidth/clientWidth/scrollLeft,
          divider offsets (only if the strip is visible)
   WRITE: selection, scrollLeft, thumb width/left, divider visibility
   ```
   Scope `syncScrollbars` to the **focused row only**; leave every other row to the existing
   `ResizeObserver` (`:293–299`), which is where non-edit size changes belong anyway. The
   idempotence of these writes (documented in `architecture.md` §4.8) is what makes phase-splitting
   safe.
4. **Per-row render memoisation.** Extract the row body (`:498–560`) into a `Row` component
   wrapped in `React.memo`, keyed on `row.id`, comparing `row.content` by reference. Structural
   sharing already guarantees untouched rows are reference-equal — this is the dividend the
   immutable tree has been paying for and never collecting. Hoist `groups` (`:492`) and
   `toolbarRowId` (`:488`) derivation out of the per-render path.
5. **Memoised serialisation.** Put a `WeakMap<FormulaNode[], string>` in front of
   `serializeToLatex` so `latexOf` (`:273`) joins cached strings. Serialisation becomes
   O(edited row) + an O(rows) join.
6. **Housekeeping.** Delete the dead `Row` type (`model.ts:19`). De-duplicate `TRAILING_TERM`
   into one exported constant.
7. **First `selection.ts` tests.** Write them *now*, not in M3 — this is the untested module that
   every later milestone touches. Cover `positionFromDom` for all four branches, `beyondFormula`,
   `nearestPosition`, and `repairField`.

**Acceptance:** all 154 tests green and unmodified; bench reports **exactly 1** forced layout per
keystroke on every fixture; the 50-row fixture improves several-fold; size ≈ **10.8 KB gz**.

---

### M2 — The construct registry *(M, ~4–5 days)* — decision D-2 applies

Keep `FormulaNode` as a discriminated union. Add one table; make the layers read it.

**Files:** `src/registry.ts` (new), `model.ts`, `reducers.ts`, `render.tsx`, `serialize.ts`,
`parse.ts` (conditional), `src/registry.test.ts` (new).

**The spec type** (adapted from 0.5.0 §2.2 to keep the union — note `slots` is typed against the
kind's own `BranchKey`s, which is exactly what generic `Record` slots would throw away):

```ts
interface ConstructSpec<K extends NodeKind> {
  kind: K;
  slots: readonly SlotDef<K>[];           // visual order = array order
  entry: { adopted: BranchOf<K>; empty: BranchOf<K> };   // caret landing, was code
  adopts: "termBefore" | "wrapAfter" | "none";           // capture mechanism, was code
  vertical?: readonly [BranchOf<K>, BranchOf<K>][];      // top→bottom, drives ↑/↓
  tokens?: readonly string[];             // typed names that create it
  primitive: Primitive;                   // which renderer draws it (M3)
  slotCode: Record<BranchOf<K>, string>;  // for the CSS modifier and, optionally, addresses
  latex: { write: WriteRule; read: ReadRule };           // gated on Q-1
}
```

**Steps:**

1. Write `src/registry.ts` with one row per existing kind — `root`, `frac`, `pow`, `sub`, `group`
   — transcribing today's behaviour exactly from the inventory in §2.5. **No behaviour change is
   permitted in this milestone.**
2. Rewrite `branchesOf` (`model.ts:47`) to read the table. **Keep its signature identical** so all
   20+ call sites are untouched. This alone makes traversal, normalisation, path comparison and
   range deletion registry-driven for free.
3. Replace the hand-written insertion chain (`reducers.ts:303–313`) and `buildNode` (`:197–208`)
   with a table lookup on `entry`/`adopts`. This is where per-construct policy currently hides as
   code and is the largest genuine win.
4. Fold `SLOT_MODIFIER` (`render.tsx:18`) and `linesIn`'s per-kind arms (`:57`) into the spec.
5. **LaTeX rules — gated on Q-1.** If the answer is workable, move `serialize.ts`'s switch and
   `parse.ts`'s six arms behind `latex.write`/`latex.read`. If it is not, declare `write` only,
   leave `parse.ts` as a switch, and record the limitation. Do not let this block the milestone.
6. **Parameterise the test suites.** `serialize.test.ts:33–66` already contains a seeded LCG
   generator (`createRandom`, seed `20260813`) producing a 400-tree corpus — reuse it. Build
   `src/registry.test.ts` running every property over **every registry row** via `it.each`:
   - alternation invariant preserved by every edit
   - every emitted address resolves in the tree it came from
   - `read ∘ write = id`
   - both entry slots reachable from outside the construct
   - vertical pairs symmetric (`up(down(x)) === x`)
   - deletion removes the construct as one object

**Acceptance — this is the release's real test:** adding a row to the table, with **no layer code
changed**, must automatically subject the new kind to every property. Zero behaviour change; all
suites green; source-map attribution shows the registry within ±0.3 KB gz of neutral.

---

### M3 — Renderer and typography *(M–L, ~5 days)*

**Files:** `render.tsx`, `MathInput.css`, `registry.ts`, `render.test.tsx`.

**Steps:**

1. **Seven layout primitives** — `row`, `stack`, `attach`, `radical`, `fence`, `grid`, `atom`.
   `renderNode` dispatches on `spec.primitive`, not on kind. `grid` ships as a stub with no
   consumer (matrices are 0.6.0) — **or is omitted entirely if the size budget bites**.
2. **`H(node)` structural height estimate** — a pure function replacing `rootSize`'s three tiers
   (`render.tsx:76`): run = 1; stack = `H(num) + H(den)`; attach adds `0.4×H(script)`; radical =
   `H(content) + 0.35`. Read off the tree, never measured — **this is the disciplined alternative
   to breaching invariant 4**, and it is testable as plain data with no DOM.
3. **Radical v2:** one thickness `max(.04em, 1px)` shared by hook, vinculum and fraction bar;
   continuous sizing from `H` rather than three tiers; the 0.5px seam overlap for fractional-DPR
   screens; the kerned index with `min-width` so an empty index stays tappable.
4. **Fences:** add `[ ]`, `{ }`, `| |` as SVG paths alongside the existing three
   (`render.tsx:42–47`), stretched with `vector-effect="non-scaling-stroke"`.
5. **Run tokenisation — gated on Q-2.** Italic variables, upright tabular digits, binary-op and
   relation spacing, hyphen-minus displayed as U+2212 (exchange still writes `-`). One span per
   class *transition*, not per character. **Implement behind a flag and do not enable it until
   Q-2 is answered** — the bridge is the risk here, not the tokeniser.
6. **Depth-capped script sizes** — the TeX ladder 1 → 0.72 → 0.55 → hold, stamped from structural
   depth, with an 11px accessibility floor.

**Acceptance:** the KaTeX reference page reviewed formula by formula; every *(starting value)* in
the 0.5.0 design replaced by a tuned one; pixel diffs against 0.4.x limited to intended changes
(italics, minus, spacing, radical proportions); `selection.ts` tests extended to cover caret
round-trip through tokenised runs.

---

### M4 — Input and interaction *(M, ~4 days)*

**Files:** `reducers.ts`, `caret.ts`, `MathInput.tsx`, `registry.ts`, `reducers.test.ts`,
`README.md`.

**Steps:**

1. **Token recognition.** A trie built from every spec's `tokens` (`sqrt`, `√`, later function
   names), matched in the reducer against literal characters just typed. Character-based,
   therefore **identical for soft keyboards, autocorrect and dictation** — mobile parity holds by
   construction. Revert rule gated on **Q-4**.
2. **Vertical arrows** from `spec.vertical`, resolving at the nearest ancestor with a declared
   pair, else previous/next row (subject to **Q-6**). Entry offset = current offset clamped into
   the target slot's run — **model arithmetic, no geometry** (invariant 4; the review explicitly
   rejected geometric sticky-x as R5).
3. **Tab walks slots** (decision D-4). Next/previous slot in declared visual order; Tab at the
   row's last slot **exits the field**, preserving WCAG 2.1.2 (no keyboard trap); Escape still
   exits immediately. **This breaks a documented contract** — `README.md:299` states each row is
   "reachable and leavable with `Tab`", and `:305` states Tab is deliberately left alone. Update
   both in the same commit, and publish the contained-key set as part of the documented contract
   (review finding U7).
4. **`=` scope** via a `relationContainer` flag on the spec — decided now, before inequalities
   ship, because deciding late is a behaviour break for shipped users.
5. **Selection wrapping.** Make `insertCompound` wrap a non-empty selection instead of deleting
   it (select `x+1`, press `/` → it becomes the numerator). **This changes two existing tests**
   (`reducers.test.ts:101` and `:151`) — rewrite them as the new specification and say so in the
   changelog. Note `takeSelection` (`reducers.ts:110`) currently runs first and deletes; the wrap
   path must branch before it.
6. **Active-slot highlight** — the single highest-value UX addition. Written **imperatively from
   the caret pass** as one `data-caret-slot` attribute, ornament-style: idempotent, no re-render,
   render purity (invariant 5) untouched, and no added layout read.
7. **Paste through the tolerant reader** (`parse.ts` exists for exactly this): if pasted text
   parses, paste structure; else insert literally. `1/2+3` becoming a fraction is the demo moment.

**Acceptance:** the scripted no-mouse task — enter `x = (1+√2)/3`, edit the radicand, raise it to
`n` — completable from the keyboard alone; bundle delta ≤ +0.7 KB gz.

---

### M5 — New constructs *(M, ~3 days)*

Each is **a registry row plus a LaTeX rule**. Nothing else.

- `opname` — named functions (`sin cos tan log ln lim`), pending **Q-3**.
- Absolute value as a **fence datum** on `group`, not a new kind: `|` typed outside a group opens
  one, inside a group closes it (mirroring today's `)` rule at `reducers.ts:326`).
- Inequalities `< > ≤ ≥ ≠` as **characters** with exchange mappings (`\le`, `\ge`, `\ne`) and a
  relation class in typography. Zero model cost.
- Greek letters as characters with `\pi` ↔ `π` exchange mappings. Zero model cost.
- `bigop` (∑ ∏ ∫) with `lower`/`upper` slots — **only if M2–M4 landed on schedule**, else it
  opens 0.6.0. The structure ships regardless, so slipping it costs nothing architectural.

**Acceptance:** the parameterised suites pass for each new row **with no layer code changed.** If
any construct requires touching a layer, that is a finding against M2 — stop and fix the registry,
do not special-case.

---

### M6 — Accessibility, API and documentation *(M–L, ~5 days)*

**Accessibility** (the largest product gap; `README.md:301` already admits it):

- **Spoken-math writer** — a pure sibling of `serialize.ts`: tree → natural language ("fraction:
  1 over 2, all squared"). Tested with no DOM. Applied as each row's accessible description.
  Locale question is **Q-8**.
- **Caret-context announcements** ("in denominator") via a polite live region driven from the
  **model** selection — no geometry.
- Verify the U+200B `CARET_PLACEHOLDER` is hidden from AT.
- **Roving tabindex** in `role="toolbar"` — today all 11+ buttons are separate tab stops, the
  opposite of the toolbar pattern.
- Explicit `tabIndex` so a `disabled` editor's fields stay reachable (today they drop out of the
  tab order entirely, since focusability comes only from `contentEditable`).
- 44 px effective touch targets; `touch-action` on the drawn scroll indicator so dragging it does
  not fight page scroll.

**API renames** (review A1–A5) — 0.5.0 is the breaking window:

| ID | Change | Migration |
|---|---|---|
| A1 | Three toolbar props → one `toolbar?: { autoHide?, constructs?, operators?, navigation? } \| false` | Old three accepted alongside for one window, mapped internally, dev-build warning; five-line codemod |
| A2 | `control-hover-border` → `control-hover-border-color` | `var(--new, var(--old, default))` dual-read |
| A3 | Document the scoping rule (bare = component, `field-`, `control-`, `root-`) | No renames — documentation only |
| A4 | Declare `--math-input-max-width` with its `48rem` default | One line; no break |
| A5 | Six radical properties → two public (`root-stroke`, `root-width`), sizes derived internally; per-instance values move to `--_` private convention | Old six honoured as overrides for one window |

**Documentation:** rewrite `README.md`'s props, styling, keyboard-policy and accessibility
sections; write the `CHANGELOG.md` 0.5.0 entry (**required** — `release.yml` fails without it);
ship a migration guide and codemod; document the monospace theme as a first-class option (this
architecture is unusually safe for it, since every structural symbol is *drawn*, not typed).

---

## Part V — Verification

| Gate | Command | When |
|---|---|---|
| Unit + property suites | `npm test` | Every milestone |
| Types | `npm run typecheck` | Every milestone |
| Build (both formats + CSS) | `npm run build` | Every milestone |
| Demo build | `npm run build:demo` | Every milestone |
| Size budgets | `node scripts/size.mjs` | CI, every commit |
| Keystroke + forced layouts | `npm run bench` | After M1; must stay at 1 |
| KaTeX visual diff | `demo/katex-reference.html` by eye | M3 and again after M5 |
| Screen readers | NVDA + VoiceOver, desktop and iOS, scripted | M6 |
| Touch | `npm run dev` on a real tablet | M4 and M6 |

**Test count expectations:** 154 today → ~240–280 after M2's parameterisation (most of them free
instances of existing properties) → ~300+ after M4–M6. **Two tests change meaning deliberately**
(`reducers.test.ts:101`, `:151`) and must be called out in the changelog.

---

## Part VI — Release mechanics

1. Land milestones on `release/0.5.0-registry`, merge to `main` when M6 is done.
2. Write the `## 0.5.0` section in `CHANGELOG.md` — **`release.yml:52–63` extracts it via awk and
   fails the release if empty.**
3. Bump `package.json` version to `0.5.0` — `release.yml:35–42` validates the tag against it.
4. **Resolve the unpushed tags first.** `v0.3.5`, `v0.3.6`, `v0.3.7` exist locally; npm has only
   0.3.0 and 0.3.3. Decide whether to publish 0.3.7 before 0.5.0 or let it be superseded. Pushing
   a tag triggers npm publish and a public GitHub release — **irreversible, and the user's call.**
5. `git push origin v0.5.0` runs: tag/version check → tests → build → `npm publish` (with
   provenance) → `gh release create` with the packed tarball.

---

## Part VII — Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Q-1/Q-2/Q-3 unresolved.** M2's LaTeX rules and M3's tokenisation are specified only up to where they meet the parser and the bridge | High | M0–M1 depend on none of them. Start there. Fallbacks documented per question |
| R2 | **The shell is untested** and is where M1's perf work lands | High | Write `selection.ts` tests during M1, not M3 (step 7) |
| R3 | **One release, many changes** (decision D-1) | Medium | Strict milestone order; green suite at every boundary; M2's rule that existing kinds pass parameterised suites before any new kind lands |
| R4 | **Registry refactor destabilises the five existing kinds** | Medium | M2 permits *no* behaviour change; the parameterised suites are the proof |
| R5 | **Size budget overruns** even at 13.5 KB | Medium | Source-map attribution after each milestone; cut order given in §2.6 |
| R6 | **Tab change breaks host expectations** (D-4) | Medium | Documented contract change, changelog, AT testing; the exit-at-last-slot rule preserves WCAG 2.1.2 |
| R7 | **Typography surprises existing users** (italic `x`, wider `+`) | Low | It is the intended headline change; before/after renders in the changelog; every spacing value overridable via custom properties |
| R8 | **Tokenisation span growth** on very long single-row formulas | Low | Bounded by class-transition count, not character count; per-row memoisation means only the edited row pays; watch the long-row fixture in CI |

---

## Appendix A — Current key map (for regression reference)

**Structural characters:** `/` `÷` fraction (adopts preceding term) · `^` power · `_` subscript ·
`(` group (wraps following term) · `)` leave group · `=` promoted to row level · `*` `×` `·` →
raised dot · `:` division character · Space = step past.

**Movement/editing:** ← → one position · Shift+arrows native then read back · Home/End row edges ·
Backspace/Delete structural · Enter / Shift+Enter new row · Escape leaves on *release* ·
Cmd/Ctrl+Z, ⇧Z, Ctrl+Y undo/redo · **↑↓ not handled** · **Tab not handled**.

**Containment:** every key the editor uses is stopped at the frame, press and release alike;
`preventDefault` only for keys the editor performs itself. Select-all, copy and app shortcuts stay
native. Three native listeners on the frame (not the field), because React's delegation would let
events pass every ancestor first and its synthetic `beforeinput` drops `inputType`.

## Appendix B — Public API today

**Props (11):** `value`, `defaultValue` `""`, `onChange`, `placeholder` `"Write a formula…"`,
`disabled` `false`, `autoHideToolbar` `true`, `showOperators` `true`, `showNavigation` `true`,
`className` `""`, `style`, `aria-label` `"Math editor"`.

**Custom properties (27 declared, `MathInput.css:2–28`)**, prefix `--math-input-`: `font-family`,
`math-font-family`, `color`, `muted-color`, `placeholder-color`, `surface`, `subtle-surface`,
`border-color`, `soft-border-color`, `accent-color`, `accent-soft-color`, `control-color`,
`control-hover-color`, `control-hover-border`, `radius`, `control-radius`, `border-width`,
`field-padding`, `field-min-height`, `field-font-size`, `root-stroke-{s,m,l}`,
`root-width-{s,m,l}`. Plus `max-width`, **referenced at `:31` but never declared**.

## Appendix C — Measured baseline (2026-08-17, commit `a425251`)

```
dist/math-input.js    raw 43,552   gz 12,846
dist/math-input.cjs   raw 33,528   gz 11,402
dist/math-input.css   raw  8,451   gz  2,145
re-minified ESM       raw 33,022   gz 11,564    ← B1's achievable target

tests: 154 in 7 files, ~978 ms
icon path data: 2,380 bytes raw across 10 strings
layout reads per keystroke: 2 + 7R + 3D  (~15 on a 1-row editor)
```

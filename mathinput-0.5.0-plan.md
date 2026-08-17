# MathInput 0.5.0 — Design Plan

**Theme of the release:** stop hard-coding constructs; make everything a declaration. 0.5.0
rebuilds the model around a **construct registry** and the renderer around **seven layout
primitives**, then spends the freedom that buys on the first wave of new constructs and a real
typography pass. Every number that is not measured is marked *(estimate)* or *(starting value —
tune)*.

Carried in from the architecture review and assumed done or bundled here: build hygiene (−1.4 KB
gz), one-forced-layout keystroke, per-row memoisation, the API renames (toolbar shape, CSS
property fixes). Constraints unchanged: no runtime dependencies, no shipped font or renderer,
KaTeX-renderable output, pure core, mobile parity, the five §9 invariants intact.

---

## 1. Scope

**In 0.5.0**

| Area | Contents |
|---|---|
| Model | Construct registry; slots generalised to *named or indexed*; address format v2 |
| Constructs | Named functions (`sin cos tan log ln`…), absolute value, inequalities (`< > ≤ ≥ ≠`), Greek letters, general-root polish; **big operators (∑ ∏ ∫) if M4 lands early, else 0.6.0** |
| Rendering | Layout-primitive renderer; run tokenisation (italics + operator spacing); radical/fence geometry v2; script-size depth caps |
| Input | Token recognition (`sqrt` → √ …), vertical arrows, Tab slot-walking, `=`-scope rule, selection wrapping |
| A11y | Spoken-math writer, caret-context live region |
| API | The review's A1–A5 renames ship here (this is the breaking window) |

**Structurally prepared but shipped later:** matrices (0.6.0 — the *addressing* for them ships
now, the construct later). **Out, unchanged:** arbitrary TeX, plugins, RTL, collaboration.

---

## 2. Data structure — the construct registry

### 2.1 Node kinds stay two; compounds gain a datum

The alternation invariant and the two-kind node model survive every construct on the roadmap and
are not touched. What changes is that a compound becomes *self-describing*:

```ts
type Node = Run | Compound;

interface Run { text: string }                      // unchanged

interface Compound {
  kind: Kind;                                       // registry key
  data?: string;                                    // per-kind payload: function name,
                                                    //   fence style, big-operator symbol
  slots: NamedSlots | IndexedSlots;
}

type NamedSlots   = Readonly<Record<string, Sequence>>;   // frac: {num, den}
type IndexedSlots = { cells: readonly Sequence[]; cols: number };  // matrix, later
```

`data` is what lets one kind serve a family: one `group` kind covers `( ) [ ] { } | |` via a
fence datum; one `opname` kind covers every function name; one `bigop` kind covers ∑ ∏ ∫. Kinds
stay few; variety lives in data.

### 2.2 The registry: one spec per kind, layers stay generic

Everything the review said should be "declared rather than special-cased" becomes literal: a
single table in the model layer, consumed generically by traversal, transformation, exchange,
presentation and input.

```ts
interface ConstructSpec {
  kind: Kind;
  slots: readonly SlotDef[] | { indexed: true };    // visual order = array order
  entry: { adopted: SlotRef; empty: SlotRef };      // caret landing (existing behaviour, now data)
  adopts: 'termBefore' | 'wrapAfter' | 'none';      // existing capture mechanism, now data
  vertical?: readonly [SlotRef, SlotRef][];         // top→bottom pairs, drives ↑/↓
  tokens?: readonly string[];                       // typed names that create it: ['sqrt','√']
  primitive: Primitive;                             // which renderer draws it (§3)
  attach?: Partial<Record<'NE'|'SE'|'N'|'S', SlotRef>>; // for the attachments primitive
  latex: { write: WriteRule; read: ReadRule };      // exchange, declaratively
}

interface SlotDef { name: string; optional?: boolean }
type SlotRef = string | number;                     // name — or index, for indexed families
```

The full 0.5.0 registry, existing constructs restated in the new terms:

| kind | data | slots (visual order) | primitive | entry adopted/empty | vertical | tokens | LaTeX write |
|---|---|---|---|---|---|---|---|
| `root` | — | `index?`, `radicand` | radical | radicand / radicand | index↕radicand (partial) | `sqrt`, `√` | `\sqrt[i]{r}` |
| `frac` | — | `num`, `den` | stack | den / num | num↕den | — | `\frac{n}{d}` |
| `pow` | — | `base`, `exp` | attach (NE=exp) | exp / base | — | — | `{b}^{e}` |
| `sub` | — | `base`, `sub` | attach (SE=sub) | sub / base | — | — | `{b}_{s}` |
| `group` | fence: `()[]{}\|` | `content` | fence | content / content | — | `abs` → `\|` | `\left(…\right)` / `\left\|…\right\|` |
| `opname` | name: `sin`… | **none** (leaf compound) | atom | — | — | `sin`,`cos`,`tan`,`log`,`ln`,`lim` | `\sin` |
| `bigop` (0.5/0.6) | op: `∑ ∏ ∫` | `lower?`, `upper?` | attach (S=lower, N=upper) | lower / lower | lower↕upper | `sum`,`int`,`prod` | `\sum_{l}^{u}` |
| `matrix` (0.6) | fence style | indexed cells + `cols` | grid | cell 0 / cell 0 | (r,c)↕(r±1,c) | — | `\begin{pmatrix}…\end{pmatrix}` |

Design notes, each a deliberate decision:

- **Function names are zero-slot compounds, not runs.** `sin` deletes as one object, renders
  upright with correct `\sin` output, and the caret never enters it — consistent with invariant
  2 (constructs are entered, never landed on; a leaf compound simply has nothing to enter, so
  arrows step past it). The alternation invariant holds: it is a compound like any other.
  The argument is **not** a slot — `sin` composes with an ordinary bracket group or bare term
  (`\sin x` is legal LaTeX), which keeps it compositional and means typing `s·i·n·(` needs no
  special case: token recognition fires on `sin`, then `(` opens a normal group.
- **Greek letters are characters, not constructs.** `π`, `θ` live in runs; the exchange layer
  maps `\pi` ↔ `π` both ways. Zero model cost. Same for inequality relations `< > ≤ ≥ ≠` —
  characters with exchange mappings (`\le`, `\ge`, `\ne`) and a *relation* class in typography
  (§3.4).
- **Absolute value is a fence datum**, not a kind. `|` typed outside a group opens `group{|}`;
  inside one, it closes it (mirroring today's `)` rule).
- **Big operators own their limits, not their operand.** `∑` with `lower`/`upper` slots; the
  summand is simply what follows in the sequence — exactly how LaTeX reads, and it keeps
  deletion and adoption trivial.
- **Mixed numbers: no construct.** The writer emits `1\frac{1}{2}` when digits immediately
  precede a fraction — a serialisation nicety, not a model object. (Open decision §7: the input
  gesture, since `1` then `/` adopts the 1 as numerator today.)

### 2.3 Address format v2 — the one internal break

An address step is currently *node index* alternating with *slot name*. Indexed families need
*slot index*. Generalise now, while the format lives only in the test suite and the element
stamps:

```
v1:  2.den.0        (node 2 → slot "den" → node 0)         + offset
v2:  2d0            named slots get one-char codes from the registry
     4#7.0          "#7" = cell 7 of an indexed family
```

Two birds: name-or-index capability **and** shorter stamps — slot codes are single characters
assigned in the registry (`n`,`d`,`b`,`e`,`i`,`r`,`c`,`l`,`u`), which directly shrinks the
per-element attribute bytes that grow with depth (review F5's concern). Combined with stamping
**runs only** (invariant 2 guarantees positions never name compounds; compounds carry only a
`data-kind` marker for hit-testing), the deep-nesting attribute tax roughly halves *(estimate)*.

This is internal-breaking only (the stamps and any host CSS keyed on them — none is contracted).
Document order comparison, parent-of, equality: unchanged in meaning, extended to integer steps.

### 2.4 What the registry buys the test suite

Because every layer is generic over specs, the invariant/navigation/round-trip suites become
**parameterised over the registry**: one property suite × N constructs instead of N hand-written
suites. Adding `bigop` to the table automatically subjects it to ~30 existing properties
(alternation preserved by every edit, every emitted address resolves, read∘write = id, entry
slots reachable, vertical pairs symmetric). Estimated new tests: +80–120 on top of 154, most of
them free instances of existing properties *(estimate)*.

---

## 3. Rendering — seven primitives, kinds as data

### 3.1 The primitive set

The renderer stops having "one case per construct" and has **one case per layout primitive**;
the registry maps kind → primitive. Seven primitives cover the entire roadmap through matrices:

| Primitive | Draws | Used by (now → later) |
|---|---|---|
| **row** | baseline-aligned horizontal box | every sequence |
| **stack** | things above things, centred, on the math axis | frac → binomials |
| **attach** | a base with NE/SE/N/S satellites | pow, sub → bigop limits, accents |
| **radical** | hook + vinculum around content | root |
| **fence** | stretchy delimiters around content | group, abs → matrix fences |
| **grid** | rows × cols of cells | — → matrix |
| **atom** | an indivisible upright symbol | opname, bigop glyph |

Adding `\binom` in some future version = registry row `stack` + `fence`, **zero renderer code**.
That is the payoff and the test of the design: if a new kind needs a new primitive, that is a
finding, not a workaround.

### 3.2 CSS recipes per primitive (starting values — tune against the harness, §6/M2)

**Row.** `display:inline-flex; align-items:baseline; line-height:1;` — fixed `line-height:1`
inside math content, always; vertical rhythm comes from padding, never from leading, or stacks
become host-line-height-dependent.

**Stack (fraction).**
```css
.p-stack { display:inline-flex; flex-direction:column; align-items:center;
           vertical-align:middle; padding-inline:.08em; }
.p-stack > .num, .p-stack > .den { padding-inline:.12em; }
.p-stack > .den { border-top: max(.04em, 1px) solid currentColor; }
.p-stack > .num { padding-bottom:.1em; }  .p-stack > .den { padding-top:.1em; }
```
- The bar is the TeX default rule: **0.04em, floored at 1px** so it never aliases away at small
  sizes — the same constant used for the radical vinculum, so all rules match.
- `vertical-align:middle` puts the bar near the math axis for balanced stacks; for lopsided ones
  (tall denominator), correct with a translateY driven by the **structural height estimate**
  (§3.5) — computed from the tree, never measured, so invariant 4 and render purity hold.
- **Nested fractions do not shrink.** This is a deliberate editor-vs-typesetter divergence:
  KaTeX shrinks inline fractions; an *editor* keeps them full-size because tap targets and caret
  legibility beat compactness, and the emitted LaTeX will be typeset properly downstream. Rows
  grow taller instead — acceptable; the row already scrolls horizontally and may grow
  vertically.

**Attach (power/subscript, later limits).**
```css
[data-sdepth="1"] { font-size:.72em; }   /* absolute .72  */
[data-sdepth="2"] { font-size:.764em; }  /* absolute .55  */
[data-sdepth="3"] { font-size:1em; }     /* cap: stays .55 */
.att-ne { vertical-align:.56em; }        /* ≈ .40em raise in base em */
.att-se { vertical-align:-.28em; }       /* ≈ .20em drop  in base em */
.att-n, .att-s { display:block; text-align:center; font-size:.72em; }
```
- Script sizes follow the TeX ladder **1 → 0.72 → 0.55 → hold** — the depth attribute is
  stamped by presentation from structural depth (the pattern already used for radical weight),
  so `x^{x^{x^{x}}}` never vanishes. Add a hard floor for accessibility:
  `font-size:max(.72em, 11px)` *(starting value)*.
- Big-operator limits (N/S) always render above/below, never inline-style beside — clearer for
  students; the emitted `\sum_{a}^{b}` lets KaTeX restyle per context downstream.

**Radical** — §3.3. **Fence.** Single SVG path per delimiter shape, stretched to content height
with `vector-effect:non-scaling-stroke` so curvature stretches while stroke stays at the shared
rule width — this is what the component already does for brackets; 0.5.0 adds `[ ] { } | |`
shapes as three more short paths (the existing three total 81 chars, §10; expect ~+120 chars
*(estimate)*). **Grid** *(0.6.0)*: `display:inline-grid;
grid-template-columns:repeat(var(--cols),max-content); gap:.25em .6em;` cells centred, the whole
grid on the math axis like a stack. **Atom.** Upright (`font-style:normal`), thin space after
function names before a non-fence operand: `.p-atom + .run { margin-left:.12em }`.

### 3.3 The radical, specifically

Keep the hybrid the document already commits to — drawn hook + border-top vinculum "one line by
construction" — with four upgrades:

1. **One thickness everywhere.** Hook stroke = vinculum = fraction bar = `max(.04em, 1px)`. The
   six `-s/-m/-l` custom properties collapse to two public ones (`root-stroke`, `root-width`)
   per review A5; internal per-instance values move to the private `--_` convention.
2. **Size from the structural height estimate, not three tiers.** Hook height/width scale
   continuously: `hook-width = .55em + .12em × (H−1)`, capped at 3 units, where H is the
   estimate of §3.5. Depth was a proxy; H is the actual thing (a shallow root around a tall
   fraction now gets a tall hook). Still pure — H reads off the tree.
3. **Kill the seam.** On fractional-DPR screens the hook/vinculum join can show a sub-pixel gap.
   Overlap the vinculum 0.5px into the hook (`margin-left:-.5px` on the radicand wrapper) —
   invisible when aligned, seam-proof when not.
4. **The index (nth root)** sits kerned into the notch: absolutely positioned,
   `font-size:.6em; bottom:.55em; right: calc(100% - .35em);` *(starting values)*, with
   `min-width:.6em` so the empty-index placeholder stays tappable.

ASCII of the geometry, for orientation:

```
  index ↘ ___________  ← vinculum: border-top, max(.04em,1px)
      ⁿ\ /
        v   radicand
   hook: SVG path, non-scaling stroke, height = f(H)
```

### 3.4 Typography: run tokenisation — the visible upgrade of 0.5.0

Today a run renders as one span; mathematical typography needs three character classes treated
differently. Presentation gains a **pure tokenisation pass** over run text (classify → wrap in
classed spans; no model change, fully testable without a DOM):

| Class | Members | Treatment |
|---|---|---|
| variable | single Latin letters | `font-style:italic` |
| number | digits, `.`, `,` | upright; `font-variant-numeric:tabular-nums` |
| binary op | `+ − ± · ×` | upright; `margin-inline:.17em` *(starting value; TeX medium ≈ .22em)* |
| relation | `= < > ≤ ≥ ≠` | upright; `margin-inline:.24em` *(TeX thick ≈ .28em)* |

Two normalisations join the existing `*→·` rule: **hyphen-minus displays as true minus U+2212**
(exchange still writes `-`) — the hyphen glyph is short and low in text fonts and is the single
most visible amateur tell; and relations map to their Unicode forms with `\le \ge \ne` written
on export. Cost: more spans per run (one per class *transition*, not per character — `2x+3y` is
5 spans, not 6 characters) — bounded, and per-row memoisation means only the edited row pays it
per keystroke. *(Estimate: +0.4–0.6 KB gz for the tokeniser + spacing CSS.)*

### 3.5 The structural height estimate (new, small, load-bearing)

A pure function `H(node) → units`: a run is 1; a stack is `H(num)+H(den)+0.4`; attach adds `0.6`
over the base for occupied N/NE; radical is `H(content)+0.3`; fence and grid derive similarly.
Presentation reads H to size radical hooks, correct stack axis alignment, and (0.6.0) scale
matrix fences. It is the disciplined replacement for every temptation to measure the page —
invariant 4 stays intact, rendering stays a pure function of the tree, and it is testable as
plain data.

---

## 4. UI/UX

### 4.1 Fonts — the monospace question, answered directly

**Recommendation: proportional serif by default; monospace as a first-class supported theme —
and this architecture is unusually safe for monospace because every structural symbol is drawn,
not typed.** Radicals, fences and the vinculum never depend on the font, so switching
`math-font-family` to a mono stack cannot break the *structure* of a formula — only the literal
characters change. That is a genuine, marketable advantage; document it.

- **Default (`--*-math-font-family`):** `Georgia, 'Times New Roman', serif` — with §3.4's
  tokenisation this yields italic variables, upright digits and true minus: textbook look, zero
  shipped bytes.
- **Monospace theme:** `ui-monospace, 'Cascadia Code', 'JetBrains Mono', Consolas, monospace`.
  What it buys: uniform advance widths (caret motion feels ruler-true; digits align **across
  rows** of worked steps — a real virtue for multi-row solutions), a code-adjacent feel where
  the host is technical. What to watch: coverage of `· × ≤ ≥ ≠ −` varies by mono font — the
  recommended stack covers all of them; `√ ∑ ∫` don't matter (drawn/atom-scaled). Keep italics
  for variables even in mono (`font-style:italic` — most modern monos carry a true italic).
- **Middle path if unsure:** stay proportional but set `font-variant-numeric:tabular-nums`
  (§3.4 does) — digit alignment across rows without mono's rigidity.
- UI chrome (toolbar, placeholder text) keeps following `--*-font-family`, separate from math
  content — the existing split, unchanged.

### 4.2 Fractions and powers — interaction polish

- **Active-slot highlight** — the single highest-value UX addition of the release. When the
  caret sits in a slot, that slot gets a faint tint + the construct a hairline outline
  (`background:color-mix(in srgb, var(--*-accent-color) 8%, transparent)`). Implementation:
  **not** in the renderer — the caret reconciliation pass (which already locates the caret's
  element every keystroke) writes one `data-caret-slot` attribute imperatively, ornament-style:
  idempotent, no re-render, render purity untouched. Deep nesting stops being "a guessing game"
  (§12.1's phrase) because the slot you are in is always visibly answered.
- **Empty slots**: dotted placeholder `min-width:.6em; min-height:1em`, and an invisible hit
  halo (`padding:.2em; margin:-.2em`) so a fingertip can actually acquire an empty exponent.
  Same halo on the fraction bar, which is a click target for the bridge's hit-testing.
- **Adoption preview** *(nice-to-have, M3 stretch)*: while `/` `^` `_` would adopt the term
  before the caret, a 120 ms underline flash on the adopted term teaches the mechanic
  wordlessly. Respect `prefers-reduced-motion`.
- Exponent legibility: the depth cap + 11px floor from §3.2 are the guarantee that `x^{2^{k}}`
  stays readable and tappable.

### 4.3 Keyboard (consolidating the review, now registry-powered)

Token recognition, vertical movement and Tab all become *registry consumers* — no per-construct
code:

| Input | Behaviour | Source |
|---|---|---|
| `sqrt`, `√` | open root | `tokens` in spec |
| `sin`…`lim` | become an opname atom | `tokens` |
| `sum`/`int`/`prod` *(if bigop ships)* | open big operator | `tokens` |
| `\|` | open/close absolute value | group fence rule |
| ↑ ↓ | slot above/below at nearest ancestor with a `vertical` pair; else previous/next row; entry offset = clamped current offset (model arithmetic, no geometry) | `vertical` |
| Tab / ⇧Tab | next/previous slot in declared visual order; Tab at the row's last slot **exits the field** (no keyboard trap; Escape still exits immediately) | `slots` order |
| Space | unchanged step-past; additionally terminates a pending token | — |
| `=` and relations | promoted to row level **unless** an ancestor spec declares `relationContainer` (decided now, before inequalities ship) | new spec flag |
| construct key with a selection | wraps the selection (select `x+1`, press `/` → it is the numerator) | adoption generalised |

Token mechanics: matched in the reducer against the trie of all `tokens`, on literal characters
just typed — character-based, therefore identical for soft keyboards, autocorrect and dictation
(mobile-parity constraint holds by construction). Escape hatch for literal text that collides
with a token (`sin` as three variables): Backspace immediately after recognition reverts to the
literal characters — one rule, matches every IDE's autocorrect-undo instinct.

### 4.4 General UX tips shipping in 0.5.0

- **Caret**: `caret-color:var(--*-accent-color)`; the zero-width anchors already guarantee the
  caret has geometry in empty slots — verify the anchors are `aria-hidden`.
- **Hover affordance (pointer devices)**: hairline dashed outline on the *innermost* construct
  under the pointer only — `.construct:hover:not(:has(.construct:hover))` — teaching "this
  deletes as one object" before Backspace proves it.
- **Selection**: style `::selection` to the accent at ~25% so structural selection reads as one
  sweep across inline-block fragments.
- **Motion**: nothing animates on the keystroke path; toolbar auto-hide and placeholder fades
  ≤ 120 ms and gated on `prefers-reduced-motion`.
- **Paste**: run pasted text through the tolerant reader first (it exists for this); if it
  parses, paste structure; else insert literally. `1/2+3` pasted becomes a fraction — the demo
  moment.
- **Incompleteness**: on blur, empty *required* slots tint amber via a state attribute the
  renderer already knows how to emit; theme-overridable, off by default *(decision §7)*.
- **A11y (from the review, shipping here)**: spoken-math writer as each row's accessible
  description ("fraction: 1 over 2, all squared"), caret-context announcements ("in
  denominator") via a polite live region driven from the model selection, roving tabindex in
  the tool strip, 44 px effective targets.

---

## 5. Weight and speed budget

| | 0.4.x (post-review diet) | 0.5.0 adds | 0.5.0 budget |
|---|---|---|---|
| Full build, gz | ≈ 9.8–10.3 KB *(review estimate)* | registry ~+0.3, primitives ~+0.5, tokeniser+typography ~+0.5, input v2 ~+0.6, spoken math ~+0.7 *(all estimates)* | **≤ 12 KB** (CI-enforced) |
| Toolbar-free entry, gz | ≈ 8.3–8.7 | same minus strip | **≤ 10 KB** |
| Forced layouts / keystroke | 1 (review Stage 2) | 0 added — highlight & ornament ride existing passes | **= 1** (CI trace) |
| Per-keystroke complexity | O(edited row) + O(rows) join | tokenisation is per-edited-run only | unchanged |

The registry itself is roughly weight-neutral: per-construct code deleted from four layers pays
for the spec table and the generic consumers *(estimate — verify in M1 with the source map)*.

---

## 6. Milestones — each ships alone behind the 154-and-growing suite

**M0 — prerequisites** *(if not already landed)*: review Stages 1–2 (build hygiene, one forced
layout, per-row memoisation) and the measurement harness, **plus the KaTeX reference page**: a
static harness rendering ~30 corpus formulas side-by-side — editor vs KaTeX — used to tune every
*(starting value)* in §3. Measure: gz baseline, ms/keystroke on the three fixtures.

**M1 — Model v2** *(M)*: registry, name-or-index addresses, one-char slot codes, run-only
stamping, parameterised property suites. Internal-breaking (stamps); zero visible change.
Measure: all suites green ×5 existing kinds; source-map delta of model+traversal+transformation.

**M2 — Renderer v2** *(M–L)*: seven primitives, height estimate, tokenisation/typography,
radical & fence geometry v2, depth caps. Measure: pixel-diff the corpus against 0.4.x (intended
diffs only: italics, minus, spacing, radical proportions); the harness signs off every constant.

**M3 — Input v2** *(M)*: tokens, ↑↓, Tab, `=` scope, selection wrap, active-slot highlight,
token-revert rule. Measure: the scripted no-mouse task — enter `x = (1+√2)/3`, edit the
radicand, raise it to `n` — completable via keyboard alone; bundle delta ≤ +0.7 KB gz.

**M4 — Constructs, Tier A** *(M)*: opname, abs, relations, Greek exchange table; bigop **if**
M1–M3 landed on schedule, else it opens 0.6.0. Measure: parameterised suites pass for each new
row of the registry with **no layer code changed** — the release's acceptance test.

**M5 — A11y + API + docs** *(M)*: spoken-math writer + live region (NVDA + VoiceOver scripted
pass, desktop and iOS); the A1–A5 renames with dual-read window and codemod; migration guide;
theming guide including the monospace theme.

Release gate: budgets in §5, corpus pixel-diffs approved, AT script passes, migration doc done.

---

## 7. Open decisions (decide by end of M1) and risks

| # | Decision / risk | Recommendation |
|---|---|---|
| D1 | Mixed-number input gesture — `1` then `/` currently adopts the 1 | Keep adoption (it is right far more often); mixed numbers via writer-side `1\frac{1}{2}` juxtaposition + a toolbar path; revisit only on user evidence |
| D2 | `=`/relation scope inside constructs | `relationContainer` spec flag; today only the row qualifies — the flag exists so matrices/systems can opt in without a behaviour break |
| D3 | Nested fractions unshrunk → tall rows | Accept (editor ≠ typesetter); cap nothing; document the divergence |
| D4 | Default font: serif vs monospace | Serif default, mono as documented theme (§4.1); flip only if the host product is code-centric |
| D5 | bigop in 0.5.0 or 0.6.0 | Time-boxed to M4; structure ships regardless, so slipping it costs nothing architectural |
| R1 | Registry refactor destabilises the 5 existing kinds | Mitigated by M1's rule: parameterised suites must pass on existing kinds *before* any new kind lands |
| R2 | Tokenisation span growth on huge single-row formulas | Bounded by class-transition count + per-row memoisation; watch the long-row fixture in CI |
| R3 | Typography changes surprise existing users (italic x, wider +) | It is the intended headline change; changelog with before/after renders; all spacing values are custom-property-overridable |

# MathInput — Architecture Review and Improvement Plan

Blind review against `architecture.md` only. Every finding is marked **[supported]** (follows
from the document) or **[confirm]** (needs verification in code before acting). Every number that
is not quoted from §10/§11 is an estimate and says so. Effort: **S** < 1 day, **M** = days,
**L** ≈ a week or more.

---

## 1. Verdict

The core is sound and worth keeping. The functional-core/imperative-shell split, the alternation
invariant, model-owned addressing, and the translate-never-compare bridge are current best
practice for structural editors, and — unusually — they are actually enforced rather than
aspirational: the invariants in §9 are load-bearing and none of them should be replaced. The
architecture is a good base for a growing KaTeX subset **with two pre-growth fixes**: slot
addressing must generalise from *named* slots to *named-or-indexed* slots before matrices arrive
(§Findings G1), and the scope of `=` promotion must be decided before inequalities and
definitions make `=` legal inside constructs (G2). The problems are not architectural; they sit
in the shell: 41% of the bundle including ~2.4 KB of icon path data, an ornament pass that
forces layout once per row per keystroke, and an input surface that is missing the three
keyboard behaviours every competing editor has. The largest product gap is the screen-reader
story, which the document does not describe at all.

**On the targets, plainly:** under 8 KB gzipped for the full editor including the tool strip is
not realistic. The estimated floor for the full build is **≈ 9.8–10.3 KB gzipped** after every
diet proposed here (estimate; sum of B1–B4). 8 KB is reachable only as a separate
toolbar-free entry point, and marginally even there (≈ 8.3–8.7 KB, estimate). One forced layout
per keystroke, by contrast, is fully achievable (F1–F2), and per-keystroke work independent of
document size is achievable for everything except a cheap O(rows) string join (F3–F4). The
best-UX goal and the size goal are in direct conflict: the keyboard and accessibility work adds
back ≈ 1.5–2 KB gzipped of genuinely new behaviour. The resolution proposed is: semantics always
ship; the toolbar becomes separable; size buys nothing by cutting behaviour.

### The explicit questions, answered

- **Is the layering earning its bytes?** Yes. The entire semantic stack — model, traversal,
  transformation, exchange — is 15.3 KB raw / ~40% of attributed output and carries every rule
  and most of the 154 tests. Layer boundaries themselves cost nearly nothing; the ceremony
  suspicion points at the shell's *contents* (icons, ornament measurement), not at the layer
  count. Keep the layering; put the shell on a diet. **[supported]**
- **Immutable tree + whole-snapshot history?** Right trade at this scale. History is 0.6 KB
  (§10), edits are O(caret depth) (§11 step 3), and snapshots share structure. The alternative —
  inverse-operation undo — is strictly more code for no user-visible gain. The real criticism is
  the opposite one: structural sharing is *paid for but not harvested* on the hot path — the
  renderer and serialiser ignore it and do O(document) work per keystroke (§11 steps 5, 8).
  F3–F4 collect that dividend. **[supported]**
- **Does the alternation invariant cost more than it removes?** No. Up to 2× nodes, most of them
  empty strings, is cheap; what it buys — every caret position is an ordinary run position,
  movement as integer arithmetic, no boundary special cases — is the difference between this
  design and the boundary-point bug farm it replaces. It survives every planned construct
  (sums/integrals = optional slots, precedented by root's optional index; absolute value = a
  bracket variant; mixed numbers = compound or juxtaposition; Greek = exchange-only; named
  functions = compound with a name datum and an argument slot). The one construct it does not
  survive unchanged is the **matrix** — see G1. **[supported]**
- **Address-stamped rendering + post-render reconciliation?** Worth it. The alternatives are a
  parallel imperative position index (a second source of truth to corrupt) or deciding from
  geometry (forbidden by invariant 4, correctly). The reconciliation pass doubles as the repair
  path for composition and dictation (§6.4), which mobile parity makes non-negotiable. The only
  cheapening worth exploring is stamping runs only (F5), since invariant 2 guarantees no
  position ever names a compound. **[supported]**
- **First change for best formula-entry UX, and does it conflict with size/speed?** Keyboard
  completion — token recognition (U1), vertical movement (U2), Tab slot-walking (U3) — plus the
  spoken-math layer (U8). It conflicts with size (≈ +1.5–2 KB gz, estimate), not with speed.
  Stated resolution above.

---

## 2. Findings

### Priority 1 — Bundle size

| ID | Finding | Cost / saving (gz, estimates unless quoted) | Effort | Risk | Marker |
|---|---|---|---|---|---|
| B1 | **Published artifact is pretty-printed.** §10 measures the re-minify delta directly. | **−1.4 KB** (measured, §10) | S | None — build config only | [supported] |
| B2 | **Icon outlines: 10 embedded paths, ≈ 2.4 KB of source characters** (§10) living in the shell. Outline path data is high-entropy and gzips poorly. §8 says the icon primitive *already* renders both filled outlines and drawn strokes — so redraw the simple glyphs (operators, arrows, ±) as strokes, which are 10–20× smaller than typeface outlines. | **−1.0 to −1.4 KB** (estimate) | M | Low; visual review of each glyph | [supported] payload; [confirm] exact saving |
| B3 | **The toolbar is not separable.** One bundle, one chunk; a keyboard-only host ships 11 tools, their icons and the strip's wrap detection it never shows. Publish a toolbar-free subpath entry (or make the strip an optional import composed by the default entry). | **−1.3 to −1.6 KB** for hosts that opt out (estimate; toolbar UI + residual icons + divider/wrap code) | M | Low–medium: packaging and one seam; default behaviour unchanged | [confirm] how entangled strip code is with row/focus management |
| B4 | **3.9 KB unattributed module glue / shared helpers / JSX plumbing** (§10). Check for duplicated downlevel helpers and a lower-than-necessary compile target; flatten to a single-module ESM emit with helpers imported once. | **−0.2 to −0.5 KB** (estimate) | S | Low | [confirm] |
| B5 | **Shell at 41.2% / 15.9 KB raw** (§10) is the only layer out of proportion, but after subtracting icons (B2) and the strip (B3), the residue — containment, classification, composition repair, controlled/uncontrolled, focus — is dense, justified code at ~10–11 KB raw. Do not chase it further. | — | — | — | [supported] |
| B6 | **Stylesheet (2.1 KB gz, 54 rules)** is outside the 8 KB JS target and reasonable. Only action: the radical-scale collapse in A5 removes a few rules as a side effect. | ~−0.1 KB CSS (estimate) | — | — | [supported] |

**Where the floor is:** 12.8 → 11.4 (B1) → ≈ 10.2 (B2) → ≈ 9.8–10.0 (B4) for the full editor.
With B3, the toolbar-free entry lands ≈ 8.3–8.7. **The 8 KB target is unrealistic for the full
component and marginal for the core entry** — and that is *before* re-spending 1.5–2 KB on U1–U3
and U8. Recommend re-basing the budget: full build ≤ 10.5 KB gz, core entry ≤ 9 KB gz, enforced
in CI (Plan, Stage 0). All figures beyond B1 are estimates.

### Priority 2 — Performance

**The real bottleneck, named:** it is not the element rebuild and it is not serialisation — for
realistic documents both are single-digit milliseconds or less. It is **step 7, the ornament
pass**: per keystroke it performs a forced layout read *per row* plus one *per divider*,
interleaved with writes (§11), so a 20-row worksheet pays 20+ synchronous layout passes at
roughly 1–3 ms each on a mid-range tablet (estimate) — potentially tens of milliseconds of pure
layout thrash before the caret read in step 6 is even counted. **What breaks first as documents
grow: (1) many rows** — the O(rows) interleaved read/write ornament pass; **(2) a very long
single row** — element rebuild plus indicator maths plus serialisation, in that order; **(3)
deep nesting, last and mildest** — address string length grows with depth for every rendered
node (§11), a GC/attribute-diff tax rather than a cliff.

| ID | Finding | Gain (estimates) | Effort | Risk | Marker |
|---|---|---|---|---|---|
| F1 | **Ornament pass forces O(rows) layouts, read/write interleaved, on every render** (§11 step 7), though only the *edited* row's scroll metrics can change on a keystroke; the rest is resize territory, and a ResizeObserver already exists. Fix: (a) scope the per-keystroke pass to the focused row; (b) split into one read phase then one write phase; (c) leave all other rows to the ResizeObserver. Idempotence of the writes (§4.8) makes phase-splitting safe by design. | From O(rows) forced layouts to ≤ 1; on a 20-row doc, ≈ 10–40 ms → ≈ 1–3 ms per keystroke (estimate) | S–M | Low; behaviour identical, ordering changes only | [supported] |
| F2 | **Second guaranteed layout read: caret scroll-into-view** (§11 step 6) runs in a separate effect from F1's reads. Merge both into a single read phase (caret rect, field rect, focused row scroll metrics, divider offsets if the strip is visible) followed by a single write phase. | Exactly **one forced layout per keystroke** — the stated target — vs "at least two" today (§11) | S | Low | [supported] |
| F3 | **Whole-document serialisation and comparison on every keystroke** (§11 step 8). Rows other than the edited one are unchanged *by reference* thanks to structural sharing — so cache row→string in a WeakMap keyed on the row's tree object. Serialisation becomes O(edited row) + an O(rows) join of cached strings. This is the dividend immutability already paid for. | O(doc) → O(row); absolute saving is sub-ms on small docs, ≈ 0.5–2 ms on 1,000+-node docs (estimate) — hygiene now, headroom later | S | Low; pure, testable without a DOM | [supported] |
| F4 | **No memoisation anywhere in the render** (§11 step 5): every node of every row becomes a fresh element with a re-encoded address string per keystroke. Memoise at row granularity on reference equality — untouched rows skip element creation *and* address re-encoding entirely. Invariant 5 (pure render) is what makes this safe; memoisation is transparent to it. Finer-grained per-node memo is not worth its bookkeeping (see Rejected R7). | O(doc) → O(edited row) element work; ≈ 1–2 ms saved on large docs (estimate) | S | Low | [supported] |
| F5 | **Address stamps on every element grow with depth** (§11). Invariant 2 says positions only ever name runs — so stamp runs only, and give compound elements a kind marker for structure hit-testing (§6.2), resolving clicks through the nearest stamped run. Roughly halves stamped attributes at depth. | Modest; attribute bytes and diff cost at depth (estimate). Defer until deep-nesting profiling justifies it | M | Medium — the bridge's hit-testing contract must be re-verified | [confirm] whether §6.2 hit-testing requires compound addresses or can resolve via nearest run |
| F6 | **History push copies a ≤ 200-entry array of references** (§4.7). Negligible; no action. | — | — | — | [supported] |

After F1–F4, the only per-keystroke work still proportional to document size is the O(rows)
string join in F3 and React's own diff — both cheap in absolute terms. The edit itself was
already O(caret depth) (§11 step 3); the surrounding machinery now matches it.

### Priority 3 — UI/UX, the keyboard above all

**Verdict on the model:** "characters that mean structure" is the right model — it is what
students know from calculators and from Desmos-class editors, and it is intent-driven, so it
survives soft keyboards (a binding constraint). The current *set* is right as far as it goes;
the three admitted gaps are exactly the three things every serious competitor has, and two of
them have one shared best answer.

| ID | Finding | Gain | Effort | Risk | Marker |
|---|---|---|---|---|---|
| U1 | **No key opens a root — and this is one instance of a general hole.** Functions, Greek letters and named roots are all *coming* (§12.1), and all of them are "the user types a name". The best approach is not a root hotkey but **token recognition**: a trie of names → construct/symbol (`sqrt` → root, later `sin`, `pi`, `theta`, `int`…), fed by the same declaration that registers a construct (§13 step 4), matched on the literal characters just typed, in the reducer, purely. One mechanism retires the root gap today and pre-builds the growth path. Also map the `√` character (present on many soft keyboards) to the same intent. | UX claim: closes the largest keyboard gap and future-proofs the roadmap in one mechanism | M | Medium — a new input class; but character-based, so mobile parity holds by construction | [supported] gap; design proposal |
| U2 | **Vertical arrows undefined** (§7.2) — the caret cannot move numerator↔denominator or base↔exponent, which on a math editor is a daily action. Fit it to the declarative model: each construct declares its slots' *vertical adjacency* (as it already declares visual order, §4.1); ↑/↓ resolve at the nearest ancestor with vertical extent, else move between rows. Entry column: clamp the current offset into the target slot's run (model arithmetic). True "sticky-x" column matching would need geometry — rejected (R5) to keep invariant 4 whole. | UX claim: removes the single most disorienting navigation failure; per §13, new constructs inherit it by declaration | M | Low–medium; traversal-layer, pure, testable | [supported] gap; design proposal |
| U3 | **Tab does not walk slots** (§7.2), which "is how most equation editors move between them" (the document's own words). Proposal: inside a formula, Tab → next slot in visual order, Shift+Tab → previous; at the last slot of the row, Tab *leaves the field* — preserving an unaided keyboard exit (WCAG 2.1.2 "no keyboard trap"); Escape remains the immediate exit (§7.2). This must be announced to assistive tech (U8). | UX claim: the standard slot-walking affordance, without creating a focus trap | S–M | Medium — containment policy change; a11y review required | [supported] gap; design proposal |
| U4 | **Space as "step past" is the right call — keep it.** The most-pressed key maps to the most frequent structural need: leaving a denominator/exponent to continue writing (`1/2␣+…`). It composes with U1: space also terminates a token. Do not spend Space on anything cleverer. | — | — | — | [supported] |
| U5 | **`=` promotion will not survive growth.** Today `=` is hoisted to row level from any depth (§7.1). Once inequalities and definitions arrive (§12.1), `=` and its relatives become legal *inside* constructs (a condition in brackets, a definition in a system/matrix cell). Decide the scope rule now: promote only when the caret's path contains no construct that declares itself a "relation container", and make that a per-construct declaration. Deciding late means a behaviour break for shipped users. | Prevents a future breaking behaviour change | S (decision) | Low now, high if deferred | [supported] |
| U6 | **Forgiveness and teaching.** The operator-replace rule is good; two additions: (1) applying a structural key to a *selection* should wrap the selection (select `x+1`, press `/` → it becomes the numerator) — the adoption mechanism (§4.3) is described only for "the term before the caret", so this may not exist; (2) tool-strip buttons should carry tooltips naming their key equivalent ("Fraction — /"), making the strip the discoverability surface for the keyboard at zero bundle cost beyond strings. | UX claims: standard recovery affordance; self-teaching key map | S each | Low | (1) [confirm]; (2) [supported] gap |
| U7 | **Containment is the right boundary.** Contain-press-and-release with pass-through for unused keys (§4.8) is the correct design and costs the user nothing observable; host undo correctly yields to editor undo while focused. One gap: the contained-key set is not part of the documented contract — publish it, so hosts can audit shortcut collisions. | — | S | None | [supported] |
| U8 | **The screen-reader story is absent from the document — the largest UX gap in the review.** A contenteditable projection of zero-width characters and drawn SVG radicals will announce as noise or silence. Needed: (1) a **spoken-math writer** — tree → natural-language string ("fraction: 1 over 2, all squared") — a pure sibling of the exchange writer, tested without a DOM; applied as each row's accessible description; (2) caret-context announcements on structural movement ("in denominator") via a polite live region, driven from the model selection (no geometry); (3) verify the zero-width fillers are hidden from AT. This costs bundle (≈ +0.6–0.9 KB gz, estimate) and is worth it; if the budget refuses, it is the strongest candidate for a separable entry alongside B3 — but the default should include it. | UX claim: from effectively unusable to genuinely usable with a screen reader | M–L | Medium; needs AT testing on at least NVDA + VoiceOver, desktop and iOS | [supported] gap (by omission); [confirm] current AT behaviour in code |
| U9 | **Touch specifics to verify:** tool-strip hit targets ≥ 44×44 px; the draggable drawn indicator sets `touch-action` so dragging it does not fight page scroll; `autoHideToolbar` on touch means the first tap reveals tools and a second tap acts — acceptable, but confirm the reveal is immediate on focus, not on first edit. Buttons already refusing focus theft (§7.3) is the right pattern. | — | S | Low | [confirm] all three |

**What a student should be able to do without a mouse** — the target key map, consolidating the
above (additions marked ▲):

| Key | Behaviour |
|---|---|
| `/` `^` `_` `(` `)` `=` `*` `:` | As today (§7.1), with U5's scoping rule for `=` |
| Space | Step past (unchanged); terminates a token ▲ |
| `sqrt`, `√` ▲ | Open a root (token recognition, U1) |
| ← → , Home, End | As today |
| ↑ ↓ ▲ | Slot above / below; else previous / next row (U2) |
| Tab / Shift+Tab ▲ | Next / previous slot; Tab at the row's last slot exits the field (U3) |
| Backspace, Delete, Enter, Escape, undo/redo | As today |

### Priority 4 — API surface and naming

| ID | Finding | Proposal | Effort | Risk | Marker |
|---|---|---|---|---|---|
| A1 | **Three toolbar props under two naming schemes, asymmetric (no construct switch), one misnamed** — all three defects the document itself observes (§1.1). | One shape: `toolbar?: { autoHide?, constructs?, operators?, navigation? } \| false` (all default `true`; `false` hides the strip — which also gives B3 a clean API story). `navigation` keeps the group name for continuity; the shape's scoping makes it unambiguous. **Breaking** — migration below. | S | Low with the dual-support window | [supported] |
| A2 | **`control-hover-border` breaks the `-color` suffix** (§1.2). | Rename to `control-hover-border-color`; honour the old name for one major via `var(--new, var(--old, default))` — zero-cost dual-read, no consumer breaks during the window. | S | None | [supported] |
| A3 | **Mixed scope prefixes** (`field-font-size` vs bare `font-family`, `radius`). | Do **not** mass-rename. Adopt and document the rule the current names almost follow: *bare = whole component, `field-` = the editable field, `control-` = buttons/controls, `root-` = radicals*. Only names violating the documented rule get the A2 dual-read treatment. Renaming 29 properties for symmetry punishes every consumer for aesthetics. | S | None | [supported] |
| A4 | **`max-width` honoured but never declared** (§1.2). | Declare it on the root with its current fallback as the default value. One line; makes the real API and the documented API identical. | S | None | [supported] |
| A5 | **Six radical properties expose a size scale (`-s/-m/-l`) used nowhere else, while `root-stroke` / `root-width` are internal but publicly named** (§1.2) — two irregularities with one cause. | Invert it: make `root-stroke` and `root-width` the *public* base values, derive the three sizes internally (`calc()` × depth factor), and rename the per-radical internal properties to the private convention `--_root-stroke` / `--_root-width` (leading `_` marks non-API). Six props become two; the name/status mismatch disappears. Old six honoured as overrides for one major. **Breaking** at the major. | M | Low–medium — verify the three sizes were ever set independently in the wild | [supported] defects; [confirm] real-world usage of independent sizes |
| A6 | **Boolean naming** (`disabled`, `autoHide…`) matches platform conventions; `aria-label` passthrough with row suffixing is good. No change. | — | — | — | [supported] |

**Migration (one major release, one window):** props — old three accepted alongside `toolbar`
for the window, mapped internally, dev-build warning on use, removed next major; a five-line
codemod covers it. CSS — every renamed/collapsed property dual-read via `var(--new, var(--old,
default))` for the window; removal next major. No consumer is stranded at any point; nothing
requires simultaneous host changes.

### Growth findings (cut across priorities; from §12.1/§13)

| ID | Finding | Marker |
|---|---|---|
| G1 | **Matrices break named-slot addressing.** A compound owns *named* child sequences (§4.1) and an address alternates "which node"/"which slot" — a name (§4.1 Addressing). A matrix has a variable number of cells; they cannot each have a fixed name. Generalise the address step to *name-or-index* (and slot declaration to "fixed named slots **or** an indexed slot family with a declared visual grid order") **now**, while the address format lives in 154 tests and one codebase — not later, when it is serialised into host expectations and the bridge. Everything else in §12.1's list fits the current shape (optional slots are precedented by root's index; absolute value is a bracket variant; Greek is exchange-only; named functions = compound carrying a name datum + argument slot, which also yields correct `\sin`-style output). | [supported] |
| G2 | **`=` promotion scope** — see U5; a growth blocker if decided late. | [supported] |
| G3 | **Small-case cost check** (§12.1's second expectation): after F1–F4, a two-character answer pays one O(1) reduction, a one-row render, one cached-string compare and one layout read — effectively nothing. The requirement holds without further work. | [supported] |

---

## 3. Plan — staged, ranked by payoff over risk

Each stage ships alone. Measure before and after every stage; the harness from Stage 0 is the
gate for all of them.

**Stage 0 — Measurement harness** *(S; prerequisite, not a payoff stage)*
CI budget on gzipped bundle size (fail over budget); a keystroke benchmark on three fixtures —
2-char answer, 50-row worksheet, 8-deep nested expression — recording ms/keystroke and forced
layout count (PerformanceObserver / DevTools tracing); AT smoke script for Stage 5. Re-base the
size budget: full ≤ 10.5 KB gz, core entry ≤ 9 KB gz (both provisional until Stage 3 lands).

**Stage 1 — Build hygiene** *(S; −1.4 KB gz measured + −0.2–0.5 estimated; no behaviour change)*
B1 minification of the published artifact; B4 target/helper audit. Measure: bundle size only.
Risk ≈ zero; ship immediately.

**Stage 2 — One layout read, size-independent keystroke** *(S–M; the largest runtime payoff)*
F1 scope-and-batch the ornament pass; F2 merge the caret read into the same read phase; F3
memoised per-row serialisation; F4 per-row render memoisation. All 154 tests must pass
unchanged — none of this touches semantics. Measure: forced layouts per keystroke (target:
exactly 1) and ms/keystroke on the 50-row fixture (expect the largest single improvement in the
whole plan, estimate 5–20× on that fixture).

**Stage 3 — Bundle diet** *(M; est −1.0 to −1.4 KB gz on the full build, plus the core entry)*
B2 stroke-drawn icons (visual review gate); B3 toolbar as a separable entry, default unchanged.
Measure: gz size of both entries; pixel-diff the tool strip.

**Stage 4 — Keyboard completion** *(M; est +≈1 KB gz; the UX payoff)*
U2 vertical slot navigation via declared vertical adjacency; U3 Tab slot-walking with the exit
rule; U1 token recognition seeded with `sqrt`/`√`; U4 space–token interaction; U6 selection
wrapping (after confirming its absence) and tool tooltips. All reducer/traversal work is pure —
extend the test suite alongside (existing 154 stay green; new behaviour gets new tests). Measure:
bundle delta; the deep-nesting fixture for traversal cost; a scripted no-mouse task ("enter
x = (1+√2)/3 and edit the radicand") completable entirely from the keyboard.

**Stage 5 — Accessibility** *(M–L; est +0.6–0.9 KB gz)*
U8 spoken-math writer + row descriptions + caret-context live region; U9 touch verifications;
roving tabindex within the tool strip. Measure: NVDA + VoiceOver (macOS and iOS) scripted pass;
hit-target audit.

**Stage 6 — API regularisation** *(S–M; one major release)*
A1 `toolbar` shape (old props dual-supported for the window), A2 hover-border rename, A4
declare `max-width`, A5 radical collapse with dual-read, A3 documented scoping rule. Breaking
changes: A1 and A5, both with the migration above and a codemod. Measure: none runtime;
docs + codemod shipped with the release.

**Stage 7 — Pre-growth structural work** *(M; before any new construct lands)*
G1 name-or-index addressing (tests extended to indexed paths); G2 `=` scope rule as a
per-construct declaration. Measure: round-trip and addressing test suites; no behaviour change
visible to users until matrices/inequalities use the new capacity.

Ordering rationale: Stages 1–2 are near-zero-risk and deliver the two hard targets that are
actually reachable (whitespace, one layout read); Stage 3 before 4–5 so the re-spend lands on a
dieted base; Stage 6 rides any major; Stage 7 gates the roadmap, not the product.

---

## 4. Rejected

| # | Considered | Why not |
|---|---|---|
| R1 | Adopt an external renderer (KaTeX/MathLive) to shrink first-party code | Violates the no-dependency/no-font constraint outright, and would add two orders of magnitude more payload than it removes. |
| R2 | Replace whole-snapshot history with inverse-operation (command) undo | More code in exchange for nothing: snapshots are already O(spine) via sharing and history is 1.6% of the bundle (§10). Not safer, not smaller. |
| R3 | Replace the alternation invariant with boundary-position objects ("between two compounds" as a first-class position) | The special cases the invariant deletes all come back — caret after a construct, empty slots, merge-on-delete — each a boundary-point bug in waiting. §Constraints demands a *safer* replacement; this is a less safe one. Keep invariant 1. |
| R4 | Replace the drawn scroll indicator with native styled scrollbars (`scrollbar-width`/`scrollbar-color`) | Saves ≈ 0.5 KB gz (estimate) but surrenders the property the drawing exists for — row height that never changes as content overflows (§8) — to per-platform scrollbar behaviour. Bad trade. |
| R5 | Geometric "sticky-x" column matching for vertical caret movement | Requires reading rendered positions to *decide* the destination, breaching invariant 4 (no editing decision from page measurement) for a marginal refinement over model-side offset clamping (U2). The invariant is worth more than the polish. |
| R6 | Virtualised / windowed row rendering for long documents | After F1–F4 the per-keystroke cost is O(edited row) + a cheap join; windowing adds scroll-anchoring and AT complexity that this document scale never repays. Revisit only if the product grows into hundred-row documents. |
| R7 | Per-node (fine-grained) render memoisation | Per-row memoisation (F4) captures nearly all of the win; per-node adds comparison overhead and cache bookkeeping across the whole tree for single-digit-% further gain (estimate). |
| R8 | Mass-renaming all 29 custom properties onto one uniform prefix grammar | Maximum consumer pain for aesthetic symmetry. The documented scoping rule (A3) plus three targeted fixes (A2, A4, A5) removes every *defect* without a churn release. |
| R9 | A Space redesign (e.g., Space inserts thin space / multiplies) | Step-past is the highest-frequency need and already matches how students write `1/2␣+…`; LaTeX-style spacing is a non-goal for the emitted subset. |
| R10 | Web Component wrapper, plugin system for third-party constructs, RTL | Explicit non-goals (§12); nothing in this plan forecloses them later. |

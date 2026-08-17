# Request: architecture review → improvement plan

## Role and setting

You are a senior front-end architect reviewing a production React component. Judge it against
current best practice for structural editors. Be concrete and critical; skip praise.

**This is a blind review.** You have no access to the repository, the build or a running
instance. The attached `architecture.md` is the whole of the evidence, and it was written for
this purpose: §1 says what the component does and lists its complete API (props in §1.1, custom
properties in §1.2), §4 describes each layer, §7 is the full input surface — every key, gesture
and affordance — §10 gives measured per-layer weight, §11 traces the per-keystroke path, §12
states the constraints and where we expect the design to grow. Work from it. Where you need a
fact it does not contain, **state your assumption and continue** — do not stop to ask, and do
not invent specifics about code you cannot see. Mark every finding as *supported by the
document* or *needs confirmation in code*, so we know what to verify before acting.

## What we have

A dependency-free React math editor: the user types a formula into an editable field and the
component emits KaTeX-compatible LaTeX. React is a peer dependency; there is no external math
renderer or font — the component draws its own radicals and brackets. Roughly 1,700 lines of
TypeScript/TSX plus 470 lines of CSS.

| | Raw | Gzipped |
| --- | --- | --- |
| Shipped ESM bundle | 43.5 KB | **12.8 KB** |
| Same bundle re-minified | 32.2 KB | 11.4 KB |
| Stylesheet | 8.5 KB | 2.1 KB |

Where the JavaScript goes: interaction shell 41%, editing rules 19%, native-selection bridge 9%,
document model 9%, rendering 8%, format reader 5%, caret traversal 5%, history and writer 3%.
Per keystroke, three things scale with document size and layout is read at least twice (§11).

## Two things to understand first

**The data structure.** An immutable, typed tree: a sequence of nodes where each node is either a
run of literal characters or a *compound* (root, fraction, power, subscript, bracket group)
owning named child sequences called slots. Every sequence obeys a strict alternation invariant —
run, compound, run … beginning and ending with a possibly-empty run, never two adjacent
compounds — restored on read and preserved by every edit. The price is up to twice as many nodes
as visible parts; the payoff is that no editing case is special. Edits rebuild only the spine to
the changed sequence and share the rest structurally, which makes whole-snapshot undo affordable.

**Caret tracking.** A caret position is an address — a walk down the tree alternating "which
node" with "which slot" — plus a character offset into the literal run that address names. That
value in state is the truth; the native selection is a rendering of it, rewritten after every
render, which doubles as a repair for stray native movement. The invariant guarantees every
position lands in a run, so compounds are entered rather than landed on and movement is integer
arithmetic, never measurement. The renderer stamps every element with its encoded address, making
the projection its own position index; one boundary module translates between model positions and
the native selection and may not derive behaviour from page geometry.

## What we want

Three goals, all of them binding: **a small bundle, maximum runtime performance, and the best
UI/UX we can get** — with the architecture staying good practice rather than clever.

Two expectations sit behind all three, and the review should test the design against both:

- **It must grow into a wider KaTeX-compatible subset** — sums and integrals with limits, named
  functions and roots, absolute value, mixed numbers, inequalities, Greek letters, matrices — by
  *declaring* constructs rather than special-casing them. Tell us where the current model, its
  invariant or its addressing would break under that, and what to change now to avoid a rewrite
  later.
- **It must be equally good on a two-character answer and a deeply nested expression.** Small
  formulas should pay nothing for machinery they never use; complex ones should stay responsive,
  legible several levels deep, and navigable without the caret becoming a guessing game.

### Priority 1 — bundle size

Target under 8 KB gzipped for the JavaScript; say plainly if that is unrealistic and where the
floor actually is. Where is the weight not earning itself? Consider the interaction shell at 41%
of the bundle, the embedded icon outlines (~2.4 KB of path data), duplicated or over-general
abstractions, code that should be data or data that should be code, anything resisting
tree-shaking or forcing the whole editor into one chunk, the 1.4 KB of whitespace in the
published artifact, and the stylesheet's 54 rules. Price each finding in KB gzipped.

### Priority 2 — performance

Make per-keystroke work independent of document size where it can be, and get to at most one
forced layout read per keystroke. Attack the three size-proportional steps and the double layout
read in §11, and name the real bottleneck rather than listing everything. Say what breaks first
as formulas get deep and documents get long.

### Priority 3 — UI/UX, and the keyboard above all

Review §7 as a design, not an inventory, and recommend the best approach rather than a patch:

- **The keyboard model.** Is "characters that mean structure" (`/`, `^`, `_`, `(`, `=`) the right
  model, and is this the right set? Space currently steps *past* what is ahead — is that the best
  use of the most-pressed key on the board? Three gaps we already know about: no key opens a
  root, vertical arrows have no defined meaning (so nothing moves between numerator and
  denominator, or between rows), and Tab does not walk a formula's slots. Tell us what a student
  should be able to do without touching the mouse, and what the key map should be.
- **Discoverability and error recovery.** Eleven tools in three groups, plus one correction rule
  (an operator typed after an operator replaces it). What else should the editor forgive, and
  what should it teach?
- **Containment.** Formula keys are stopped at the editor so the host's shortcuts do not fire.
  Is that the right boundary, and does it cost the user anything?
- **Touch and accessibility.** The editor is used on tablets. Judge the tool strip, the drawn
  scroll indicator, focus handling and the screen-reader story, and say what is missing.

### Priority 4 — the API surface and its naming

Review §1.1 and §1.2 as a public contract, with **naming convention as the main lens**. Eleven
props and twenty-nine custom properties are what consumers live with, and renaming later is a
breaking change, so we would rather be told now. Judge: consistency of scheme within each surface
and between them, prefixes and scoping, boolean naming, whether the three toolbar props should be
one shape, the colour properties that break the `-color` suffix, the three irregular custom
properties (one honoured but never declared, two internal but publicly named), and the size
scale exposed only for radicals. Propose the naming you would ship, and a migration that does not
strand existing consumers.

## Questions to answer explicitly

- Is the layering (pure core, imperative shell, single dispatch path) earning its bytes, or is
  some of it ceremony?
- Are the immutable tree and whole-snapshot history the right trade at this scale?
- Does the alternation invariant — up to double the nodes, an address string per element — cost
  more than the special-casing it removes, and does it still hold up as constructs are added?
- Is address-stamped rendering plus post-render caret reconciliation worth its cost, or is there
  a cheaper way to keep the caret authoritative?
- What would you change first if the goal were the best formula-entry UX on the web, and does
  that conflict with the size and speed targets?

## Deliverable

**One Markdown plan**, structured as:

1. **Verdict** — the architecture as it stands, in a short paragraph, including whether it is a
   sound base for a growing KaTeX subset.
2. **Findings** — each with: what it is, why it costs, estimated saving or gain (KB gzipped,
   ms/keystroke, or a UX claim, labelled as an estimate), effort, risk, and the *supported /
   needs confirmation* marker. Group them by the four priorities.
3. **Plan** — ranked by payoff-to-risk, in stages that can each ship alone, with what to measure
   before and after each stage, and any breaking change called out with its migration.
4. **Rejected** — changes considered and deliberately not proposed, with reasons.

## Constraints

- Behaviour and public API stay as they are unless a break is called out and justified with a
  migration.
- No runtime dependencies; no external math renderer or font.
- Output must remain KaTeX-renderable.
- The invariants in `architecture.md` §9 stay intact — propose replacing one only with an
  argument for why the replacement is *safer*, not merely smaller.
- Core-layer purity is not negotiable; mobile, soft-keyboard and input-method parity is not
  negotiable; the 154 existing tests must keep passing.
- Prefer a number to an opinion, and say plainly when a number is an estimate or rests on an
  assumption.

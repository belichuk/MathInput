# MathInput 0.5.0 — what changed, and what to review

> **Status:** sixteen commits on `release/0.5.0-registry`, from `6bfa70e` (the plan) to
> `450ea3e`. Version bumped, changelog section written, **no tag pushed**. 333 tests green.
>
> **Second pass.** Everything below the line was written when M6 was half-done; it has been
> brought up to date, and where a section recorded a mistake or a gap that has since been closed
> the record of it stays and says so. The four things your review asked for before tagging —
> A1/A2/A3 with a migration guide and codemod, the accessibility hygiene, spoken math and the
> live region, and the plan corrections — are done.
>
> **Audience:** a reviewer deciding whether this ships. Written against
> `mathinput-0.5.0-implementation.md`, and it says where the work departed from that plan and
> why. Nothing here is a claim I did not measure or test.

---

## 1. The short version

Five of seven milestones are complete, one is 6/7, and one is deferred whole.

| Milestone | State |
|---|---|
| **M0** measurement harness | ✅ complete |
| **M1** diet and hot path | ✅ complete |
| **M2** construct registry | ✅ complete |
| **M3** renderer and typography | ✅ complete |
| **M4** input and interaction | **6 of 7** — token recognition not done (gated on Q-4) |
| **M5** new constructs | ⏭️ **moved to 0.6.0**, with token recognition, as one coherent release |
| **M6** accessibility, API, docs | ✅ complete — A1–A5, the spoken-math writer, the live region, the toolbar pattern, and the migration guide |

The headline: a construct is a row in a table; a keystroke costs the browser one layout instead
of three and is ~8× faster on a fifty-row worksheet; and a formula is set the way mathematics is
set rather than as characters in a row.

**The largest product gap in the plan — the screen-reader story — is closed.** Each row is
described in words written from the tree, and the caret arriving in a slot is announced. It is a
plain reading rather than MathSpeak, and it is English only; both limits are stated in the README
rather than left to be discovered.

---

## 2. What to review, in order of how much it would cost to get wrong

1. **`src/registry.ts`** — the release's central claim. Does the table say the right things, and
   is the strict/loose type split (§4.2) a reasonable way to keep the typed union?
2. **`src/selection.ts`** — the DOM bridge. Typography split a run into several text nodes, and
   this is the seam that absorbed it. It had no tests before this release.
3. **The behaviour changes in §5** — six of them change what the editor does in ways a user will
   notice, two change a documented contract, and the sixth changes what leaves the field on the
   clipboard.
4. **`src/speech.ts`** — the only English the component speaks, and the one place this release
   departs from M2's rule that a construct is declared once. §4's M6 says why.
5. **The size ratchet in §7** — it has now failed once, by 46 bytes, which is the argument for it.
6. **§8, the plan's false premises** — folded back into `mathinput-0.5.0-plan.md` as of this
   release, so the next implementer reads the correction where the claim was.

---

## 3. Measurements

All reproducible: `npm run size`, `npm run bench`, `npm test`.

### Size (gzip level 9, `node:zlib`, React external)

| | 0.3.7 | 0.5.0 | |
|---|---|---|---|
| `math-input.js` (ESM) | 12,951 B | **15,312 B** | +2,361 B |
| `math-input.css` | 2,121 B | **2,290 B** | +169 B |

The ESM figure moved a long way in both directions during the release: **−1,522 B** from fixing
minification, then back up as the registry, typography, input, accessibility and API work landed.
Net +2,361 B for everything in §4 and §5 — of which the spoken-math writer and the live region are
672 B and the toolbar prop's dual support 374 B.

> A note on the plan's baseline. Appendix C records 12,846 B for the ESM build; that came from
> macOS `gzip -9`, which compresses this bundle about 105 B smaller than `node:zlib` does. The
> gate uses `node:zlib` because it gives the same answer on every machine. Same file, different
> compressor — not a regression.

### What a keystroke costs

Counted, not timed, by `npm run bench`; asserted in CI by `src/bench/layout-reads.test.ts`.

| | 0.3.7 | 0.5.0 |
|---|---|---|
| Layout reads, 1 row | 15 | **11** |
| Layout reads, 50 rows | 358 | **11** |
| **Forced layouts, any size** | 3 / 52 | **1** |

A *forced layout* is a read the browser could not answer from the layout it already had: the
first after a render, and every read that follows a write. It is the number that costs
wall-clock, and it is now 1 regardless of what is on the page.

Timings (jsdom, so the ratios matter and the absolute numbers do not). A keystroke on a fifty-row
worksheet: **15.6 ms → 2.1 ms**. It was 20.5× slower than the same keystroke on a one-row field;
it is now 2.3× slower.

### Tests

154 → **333**, in 15 files. `selection.ts` and the shell had no tests at all before this release.

| File | Tests | |
|---|---|---|
| `registry.test.tsx` | 81 | new — every property over every registry row |
| `reducers.test.ts` | 78 | |
| `selection.test.ts` | 32 | new — the DOM bridge |
| `caret.test.ts` | 30 | |
| `model.test.ts` | 28 | |
| `render.test.tsx` | 17 | |
| `parse.test.ts` | 14 | |
| `accessibility.test.tsx` | 10 | new — the toolbar pattern, the spoken description, the live region |
| `speech.test.ts` | 10 | new — the reading, with no DOM anywhere in it |
| `serialize.test.ts` | 7 | |
| `bench/layout-reads.test.ts` | 6 | new — the hot path, held to a number |
| `toolbar.test.tsx` | 6 | |
| `deprecations.test.tsx` | 6 | new — the old prop spellings, and that they still work |
| `keyboard.test.tsx` | 7 | new — the acceptance task, the IME seam, and what a copy takes |
| `highlight.test.tsx` | 3 | new |

---

## 4. What changed, by milestone

### M0 — measurement (`463fe2f`)

- **`npm run size`** — a budget per artefact, failing the build over it. Also fails if the
  package gains a runtime dependency, or if anything belonging to the demo reaches the bundle.
  Both failure paths were made to fire before either was believed.
- **`npm run bench`** — counts layout accessors in order, so reads-after-writes are counted apart
  from free reads. Deterministic, and asserted in the ordinary test suite.
- **`demo/katex-reference.html`** — 38 expressions drawn by the component beside the same LaTeX
  set by KaTeX, with an overlay mode. Every tuned value in §4.4 was tuned against this page.
  KaTeX is a devDependency of the demo and the size gate enforces that it stays one.

### M1 — diet and hot path (`463fe2f`)

- **One layout per keystroke.** Two effects that read the page, wrote it and read it again became
  one pass: read everything, then write everything. `scrollCaretIntoView` became
  `caretScrollOffset`, which measures and returns rather than measuring and applying.
- **Per-row memoisation.** An edit re-renders the row it touched. This is the dividend structural
  sharing had been paying since 0.2.0 and never collecting.
- **Memoised serialisation.** A `WeakMap` keyed on the node arrays, sound because the tree is
  immutable and structurally shared — verified before relying on it, by checking that nothing
  mutates a published array.
- **Minification.** The published ES bundle was mangled but *pretty-printed*, 1,508 lines of it.
  The lever was Rolldown's per-output `minify`, which defaults to `dce-only`; `build.minify`
  never reaches it. **−1,522 B.**
- **All 154 pre-existing tests passed untouched**, which was the milestone's requirement.

### M2 — the construct registry (`33d92f7`, `6c386c4`)

One table; the layers read it. `branchesOf` builds branches from a row's slots, so traversal,
normalisation, path comparison and range deletion follow a new construct without being touched.
The insertion chain and `buildNode` are a lookup. `SLOT_MODIFIER` and `linesIn`'s per-kind arms
are fields. The serializer's switch is one call. `closeGroup` asks which construct a character
closes rather than naming one.

**The acceptance criterion was demonstrated, not asserted.** I added a sixth construct — a type in
the union (unavoidable under D-2) plus one registry row, no layer code — and it was automatically
subjected to every property. `satisfies` caught the missing row as a compile error first.

That experiment found a real defect, twice:

- **First attempt:** the construct parsed, held a caret, adopted terms, deleted as one object and
  serialised correctly — and **drew nothing at all**. The renderer switched on kind, had no arm,
  and a switch with no arm returns `undefined`, which React renders as absence.
- **Worse, every property passed.** The rendering property asked whether emitted addresses
  resolve, which a construct emitting none satisfies trivially. It asked whether what is drawn is
  right and never whether it is *there*.

`6c386c4` fixed both: a row names the shape it is drawn as, and a property now asks whether the
construct's own element is on the page holding every slot it declares. Re-checked with a seventh
construct using slot names nothing else uses — it draws, no layer code touched.

### M3 — renderer and typography (`50dd121`, `4889535`, `18d6c1d`)

- **Operations are spaced** — TeX's medium space around a binary operator, thick around a
  relation. Whether a `+` *is* an operation depends on what precedes it: the minus of `-b` is a
  negative and takes none, the minus of `b²-4ac` is a subtraction and does.
- **Letters italic, digits upright and tabular.**
- **A minus is U+2212** in the drawing only. The model keeps the hyphen; LaTeX is unchanged;
  offsets still count the same characters. A pasted U+2212 normalises back.
- **Scripts follow TeX's ladder** — 1 → 0.72 → 0.55, then hold, floored at 11px. This fixed a
  real bug: `0.72em` per level compounded, so `x^{y^{z^{w}}}` set text at **6px** in a 24px field.
- **A radical's weight is a function of what it covers**, continuous rather than three tiers
  chosen by two thresholds. Both stroke and reach grow from the value at one line and stop.
- **A root's index sits at the upper left**, kerned against the rising stroke — it was adrift
  below and to the left, and the CSS pushed it *further down* as the root grew.
- **One thickness for every rule.** A fraction's bar was a hardcoded `1.5px` that ignored font
  size.
- **The four stretchy delimiters are drawn** — paren, bracket, brace, bar. Only paren has a
  construct; the others wait for M5, which is the point of the shape being a datum.

### M4 — input and interaction (`c746559`, `1fff96f`, `b2bd3d4`, `dd38de7`)

| Step | |
|---|---|
| 1 token recognition | ❌ **not done** — revert rule gated on Q-4 |
| 2 vertical arrows | ✅ ↑/↓ were not handled at all, not even stopped at the frame |
| 3 Tab walks slots | ✅ decision D-4 |
| 4 `=` scope | ✅ via a `relationContainer` flag |
| 5 selection wrapping | ✅ |
| 6 active-slot highlight | ✅ |
| 7 paste through the parser | ✅ |

**The acceptance test is written and passing** (`src/keyboard.test.tsx`): write `x = (1+2)/3`,
`Tab` back into the brackets, `↓` to the denominator and `↑` back, raise the lot to a power —
keys only, every step a real event of the kind a keyboard sends.

### M6 — accessibility, API and documentation (`59e5339`, `e8ebc52`, `7d0d272`, `450ea3e`)

**Accessibility.** The U+200B placeholder is `aria-hidden`; the toolbar is one tab stop with the
arrow keys, `Home` and `End` moving inside it and focus following, which is the pattern
`role="toolbar"` asks for and the companion to D-4 — `Tab` walking slots made eleven tab stops
between one row of a worksheet and the next; a `disabled` field keeps an explicit `tabIndex` so a
submitted answer stays reachable; touch targets are 44 px.

**Spoken math** (`src/speech.ts`) is a pure sibling of `serialize.ts` — tree in, sentence out, no
DOM in it or in its tests — applied as each row's `aria-describedby`. A **polite live region**
announces the slot the caret arrives in, read from the model's selection, so invariant 4 holds:
no announcement comes from reading the layout. It says the slot and only on the change, because
React writes nothing when the text is the same and an unchanged region announces nothing.

One departure worth a reviewer's attention: **the readings are not a registry column**, which is
the single place this release breaks M2's rule that a construct is declared once. They are the
only English the component speaks and Q-8's locale option needs them in one replaceable place. The
registry's guarantee is kept by other means — `SPOKEN` is checked against
`Record<ConstructKind, Reading>`, so a construct with no reading is a compile error exactly as one
with no `draw` is, and a runtime test asserts each reading actually uses every slot handed to it.

**API.** **A1** ships as dual support: one `toolbar` prop, the old three still accepted and mapped
internally, each warning once per page in a development build. **A2** is a dual read —
`var(--math-input-control-hover-border-color, var(--math-input-control-hover-border))`, through
one internal value so the pair cannot fall out of step. **A3** is documentation: the scoping rule
(bare = component, `field-`, `control-`, `root-`) with the three older names that predate it named
as staying. **A4** and **A5** landed earlier. Removal of the old spellings waits for 0.7.0.

**MIGRATING-0.5.0.md** carries both renames and a codemod, which was run against fixtures rather
than written and hoped over — including the case that a naive regex corrupts, a tag whose
`onChange={(v) => save(v)}` contains a `>`.

---

## 5. Behaviour changes a user will notice

Six, two of which change a documented contract. The sixth was missing from the first version of
this document, and it was missing in the way that matters: it is a consequence of a change I did
report, which is exactly the kind of thing a report written by the person who made the change
does not see. Every one now has a test that names it.

1. **Typography.** Spaced operations, italic letters, upright digits, a real minus, and radicals
   weighed by what they cover. This is the intended headline change and every value was tuned
   against the KaTeX page.
2. **A formula is written *around* a selection** rather than over it. Select `x+1`, press `/`, and
   it is the numerator. Every construct used to delete the selection — the one input a selection
   is least likely to have meant. A selection spanning from inside a construct to outside it is
   still replaced: half a fraction is not a term.
3. **`=` stops where it makes sense.** It used to escape to the row from anywhere, so `(x` then
   `=` wrote `\left(x\right)=` — the relation pushed outside the brackets it was about.
4. **`Tab` walks the slots** (decision D-4). **Breaking:** a host relying on one `Tab` to leave the
   field may now need several. With no slot left it is not taken at all, so the field is never a
   keyboard trap (WCAG 2.1.2), and `Esc` still leaves in one.
5. **Six radical custom properties became two** (A5), plus `--math-input-rule` and the two spacing
   properties are new. **Breaking** for anyone who set the three weights by hand.
6. **Copying out of the field now yields `−` (U+2212) where 0.3.7 gave a hyphen.** This one is
   intended, and it is a consequence of change 1 rather than a change of its own: the renderer
   draws a real minus, and the browser's own copy takes what is drawn. The `value` the component
   reports is untouched — the model keeps the hyphen the user typed and `serialize.ts` writes it,
   so the LaTeX round-trips exactly as before. What changes is text copied *out* of the field by
   hand, which may then be pasted somewhere that compares strings: an answer key, a marking
   script, a database column. `−` and `-` are different characters and no comparison sees them as
   equal.

   Two things sit next to this and are **not** new, but are worth knowing together with it. The
   zero-width character the caret needs in an empty slot is in the DOM, so it comes along in a
   copy too — `aria-hidden` keeps it out of the accessibility tree and has never had anything to
   do with the clipboard. And a copy of a *fraction* has never produced usable text, since the
   numerator and denominator are two boxes and a copy flattens them. A host that needs the value
   should read `onChange`; the clipboard is the browser's, not the component's, and 0.5.0 does
   not take it over.

### Tests that changed meaning

The plan anticipated two. **It was twelve.**

| Count | Which | Why |
|---|---|---|
| 2 | `reducers.test.ts:101`, `:151` | Exactly as the plan predicted — selection wrapping |
| 5 | radical sizing | They asked "which of the three radicals", a question with no answer now |
| 5 | run structure and the drawn minus | Digits and letters were unclassed; the hyphen was drawn |

Since the first version of this document, each of the six changes above has a test named for it,
and the five typography tests were re-read for the guarantee that had to survive rather than for
whether they still passed. Two were strengthened as a result: the offsets test now writes and
reads back *every* offset across a run whose drawing changed rather than one of them, and the
radical test asserts the two multipliers the public properties are scaled by, which is the
property A5 actually promises.

Every one is a case where the thing the test described stopped existing, and each was rewritten as
the new specification rather than deleted. But it is a larger drift from Part V than planned and
a reviewer should satisfy themselves that none of them quietly dropped a guarantee.

One more, worth flagging honestly: I also modified `serialize.test.ts`, one of the original 154,
to share its seeded generator via `testing.ts` — the plan asked for that generator to be reused.
No test's meaning changed and all seven still pass, but M1's "untouched" property does not extend
to M2.

---

## 6. Open questions

| | Gates | State |
|---|---|---|
| **Q-1** ReadRule/WriteRule | M2's LaTeX rules | **Resolved by the documented fallback.** `write` declared, `read` not; `parse.ts` stays six hand-written arms |
| **Q-2** tokenisation vs the bridge | M3 step 5 | **Resolved by implementation** — see below |
| **Q-3** `opname` shape | **M5 entirely** | ⏭️ open, and now 0.6.0's to answer along with M5 |
| **Q-4** token-revert state | M4 step 1 | ⏭️ open, and moves with token recognition to 0.6.0 |
| **Q-8** spoken-math locale | M6's writer | **Answered for now:** English inline, but all of it in one table in `speech.ts`, so a locale option is a decision about how a host supplies a replacement rather than a hunt through five files |

**Q-2's answer, for the record:** nested spans under the addressed run, carrying no address of
their own, with `selection.ts` owning the offset↔(child, offset) mapping in both directions. A run
that is all one class keeps its single text node and wears the class itself, so the common case is
unchanged. The trap was `repairField`: React diffs its own last description of the DOM, not the
DOM, so repairing a split run as one text node leaves React addressing spans that no longer exist.
It rebuilds through the *shared* tokeniser.

**Q-1's cost, stated plainly:** adding a registry row gives a construct its slots, caret
behaviour, height, styling, traversal, deletion, drawing and LaTeX *output* — but not LaTeX
*input*. A new construct still needs an arm in `parse.ts` by hand. The property named
`is read back as the construct it was written from` fails loudly when one is missing, so the tests
hold the guarantee the table cannot.

---

## 7. The size budget: raised on instruction, then made a ratchet

From 13.5 KB to **20 KB**, at your direction, after I flagged that it was binding — and then, on
your review, to a ratchet at ~15 KB, which is the right shape and was the right criticism. A
number six kilobytes above the actual size cannot bind, so it says nothing until the day it says
everything at once. It is now *actual + a stated allowance for the next release's known work*,
reset at each tag, with the arithmetic in `scripts/size.mjs` rather than a round number.

**It has already failed once, which is the point.** The 0.5.0 allowance was 1,000 B for spoken
math, the live region and M6's API work. Spoken math and the region cost 672 B — the plan
estimated 0.70 KB, which is as close as an estimate gets — and the toolbar prop with its
deprecation seam cost 374 B. Together 1,046 B: over by 46. The gate caught a 46-byte miss. The
20 KB ceiling would have caught nothing.

The reasoning, so it can be checked: 13.5 was arrived at by adding up estimates. Two were wrong in
opposite directions — the minifier gave more than expected (−1,522 B against −1,250), the icons far
less (§8). And the work that was never estimated at all cost the most: per-row memoisation
(+523 B), and a "typography" line item budgeted as one entry that turned out to be a tokeniser, a
script ladder, four delimiters and a continuous radical.

By the vertical arrows there were 217 B left and six of M4's seven steps unwritten, with §2.6's cut
order already spent: the `grid` stub was never built, the tokeniser *is* the typography and cannot
be given back, and making spoken math opt-in frees nothing until spoken math exists. What was left
to cut was product, and D-3 says behaviour wins and the number moves. It is still a hard gate.

**The `vs 0.3.7` column is now doing the real work** — a 6 KB headroom does not catch drift, but a
per-commit delta does.

---

## 8. Claims in the plan that are not true — and one in this document

**First, this document's own.** The version of §4 written at M4 said the acceptance test passed
and did not say that the test had been weakened to get there. The plan's task was
`x = (1+√2)/3`; what was written was `x = (1+2)/3`, with the root taken out — and the root was
the hard part, since at that point no key opened one at all. That gap was the top item of the
original review, and a test of the task with its hard part removed reports the opposite of what
it measures. It is fixed rather than merely disclosed: `√` and `∛` now open roots the way `(`
opens brackets, and the acceptance test writes the plan's task, tabs back into the radicand,
edits it and raises the whole thing to a power.

Part II §2.3 corrected eight premises from the earlier documents. Three more turned up. **All
three are now folded back into `mathinput-0.5.0-plan.md` itself**, at the lines that made the
claims, so the next implementer meets the correction where the claim was rather than in a release
note they may never open:

1. **"`1/2+3` becoming a fraction is the demo moment"** (M4 step 7). It does not and cannot: `/`
   is not LaTeX, whatever the `/` key does when pressed. `parse.ts` has no `/` arm and should not
   grow one, since the reader's job is to read what the writer writes. Pasting *LaTeX* is what
   works, and is the more useful behaviour — it is how a formula moves between this field and
   KaTeX, a textbook, or another copy of the editor. Corrected in the plan at §4.4.
2. **B2's icon ceiling was ~0.5 KB; the real ceiling is 779 B** — measured by stubbing all three
   outlines. I took 177 B of it (the fraction icon, which reproduces exactly from primitives the
   other icons already use) and left the rest: `remove` and the `x` in `power` are letter-like
   shapes a 34-unit stroke would coarsen, and `power`'s sits beside a numeral from the same
   typeface. That is D-3 applied, not an oversight.
3. **The insertion policy is per *trigger*, not per construct.** The spec sketch in M2 put
   `entry`/`adopts` on the construct. But `/` adopts the preceding term and waits in the
   denominator, while the toolbar's fraction button takes nothing and waits in the numerator —
   same construct, opposite behaviour. There are trigger tables beside the construct table, and
   only the *adopted slot* stayed with the construct. Corrected in the plan at §2.2, above the
   sketch, since M5's `opname` and `bigop` rows are the next things that would build on it.

Also: M3's rule thickness of `max(.04em, 1px)` "shared by hook, vinculum and fraction bar" was not
taken literally. Shared it is, but at the shared value the radicals came out visibly lighter than
the reference, so a radical carries 1.4× what a fraction bar does. This is not an inconsistency —
this radical is drawn at a single thickness throughout, where a typeset one is a glyph that
thickens along its diagonal and only its bar is a hairline.

---

## 9. Risks

| | |
|---|---|
| ~~The accessibility gap is untouched~~ | **Closed.** Spoken descriptions, a live region, the toolbar pattern, a reachable disabled field, 44 px targets. The remaining limits — a plain reading rather than MathSpeak, and English only — are in the README |
| ~~A1/A2/A3 are breaking and unshipped~~ | **Closed**, as deprecations rather than removals: both spellings work through 0.6.x and the old ones go in 0.7.0 |
| ~~No migration guide or codemod~~ | **Closed.** `MIGRATING-0.5.0.md`, with a codemod tested against fixtures |
| **Row semantics are still thin** (Q-6) | `createRow` appends and never splits at the caret; `Backspace` never merges rows. ↑/↓ between rows now exists and sits on top of that. **Named as a known limitation in the changelog**, so it is not filed as a regression of the new arrows — and it is why `toolbar={false}`, which takes the remove-row control with it, is documented as belonging with a single-row field |
| **Token recognition is not in** (M4 step 1) | Moved to 0.6.0 with M5, which is where it belongs: `sqrt`→√ and `sin`→an opname are the same mechanism, and splitting them across two releases would ship the machinery twice |
| **Twelve tests changed meaning** | See §5 |
| **`output.minify` is a Rolldown option** | If a future version stops honouring it the bundle quietly gains 1.5 KB. The size gate's per-commit delta is what catches it |

---

## 10. Release mechanics

Done: version is `0.5.0`; the `## 0.5.0` section exists and **79 lines extract** via the
workflow's own awk, re-checked after the changelog grew a Deprecated section, a Known limitations
section and the note about the unpublished tags; the tag/version check will match. Both failure
modes verified here rather than discovered mid-release.

**Not done, and deliberately: no tag is pushed.** That publishes to npm and opens a public
release.

**The tag gap is decided: publish over it.** `v0.3.5`, `v0.3.6` and `v0.3.7` exist locally, were
never pushed, and npm has only `0.3.0` and `0.3.3`. 0.5.0 supersedes all three, and pushing them
now would trigger three publishes and three public releases of code nobody is waiting for. The
changelog carries one line saying so — *0.3.5–0.3.7 were internal and never published* — which is
the whole of what a reader of the npm history needs.

---

## 11. Recommendation

**Ready to tag.** M6 is finished, M5 and token recognition are 0.6.0's, and the four things your
review asked for before tagging are done and tested.

The split held up in the doing. M6's renames are breaking and this was the breaking window, so
they had to land here — and they landed as *deprecations*, which is what makes the window
survivable: a host upgrades today and runs the codemod whenever it suits. M5 is the opposite. It
is blocked on Q-3, its whole point is that new constructs are cheap now — better demonstrated on
a released registry than held hostage to it — and token recognition belongs with it, since
`sqrt`→√ and `sin`→an opname are one mechanism and shipping it twice would be the worse of the
two available mistakes.

What a reviewer should still weigh: the spoken reading is a plain one and not a standard, the
readings sit outside the registry for a stated reason, and row split and merge remain undone and
named as a limitation rather than fixed.

**Still not done, and deliberately: no tag is pushed.**

# MathInput: structured document model rewrite

## Context

Today `src/MathInput.tsx` (624 lines, everything in one file) treats the **live contentEditable DOM as the source of truth**. React `rows` state only holds `{id, text}` as a one-time seed for `dangerouslySetInnerHTML` on mount; every edit — typing, arrow-key navigation, Backspace, inserting a fraction/root/power — directly mutates the live DOM via `Range`/`Selection` Web APIs, and the LaTeX value is only reconstructed by walking that DOM (`latexFrom`) when `onChange` needs to fire. An invisible hair-space character (`CARET_ANCHOR`) is stitched into the DOM after every formula purely so the caret has somewhere native to land, because there's no real state-based caret tracking.

This is fragile by construction: caret position has to be *inferred* from the DOM via `Range.compareBoundaryPoints`/`cloneContents`, and two separate real bugs shipped this cycle (commits `378938f`, `1a298b3`) from exactly this — a `(parentElement, childIndex)` boundary point and a `(textNode, offset)` boundary point that describe the *same* visual position are not considered equal by the DOM spec, which silently broke `ArrowRight`/`ArrowLeft` out of any slot holding a single text node (the common case: a plain number in a fraction). The component also has zero test coverage, because none of this logic is testable without a live browser.

**The fix is architectural, not another patch**: represent each row's formula as an explicit, typed tree (`FormulaNode[]`) that React state owns, make caret position a plain data value (`{path, offset}`) resolved by array indexing instead of DOM comparison, and let the DOM become a pure rendering target that gets synced *from* state (one direction only) rather than mutated directly. This eliminates the entire bug class, makes the editing logic unit-testable for the first time, and is the standard shape used by every structured rich-text editor (Slate/ProseMirror/Lexical) — just scoped down to this component's 4-node grammar (text, sqrt, frac, power).

Elements are **fully structured/nested** (not opaque LaTeX strings for compound formulas), so editing works uniformly at any depth — and the rewrite is **staged**, with the old implementation removed only once the new one covers everything.

## New data model

`src/model.ts` — pure types and structural helpers, no DOM, no LaTeX grammar:

```ts
type TextNode = { type: "text"; value: string };
type SqrtNode = { type: "sqrt"; content: FormulaNode[] };
type FracNode = { type: "frac"; numerator: FormulaNode[]; denominator: FormulaNode[] };
type PowerNode = { type: "power"; content: FormulaNode[] };
type FormulaNode = TextNode | SqrtNode | FracNode | PowerNode;
type Row = { id: string; content: FormulaNode[] };

type BranchKey = "content" | "numerator" | "denominator";
type PathStep = { index: number; branch?: BranchKey }; // branch = which array of the
  // compound node at `index` to descend into next; last step's branch is unused
type Path = PathStep[];
type CaretPosition = { path: Path; offset: number };
type Selection = { anchor: CaretPosition; focus: CaretPosition }; // add now even though
  // only used from Stage 3b onward — retrofitting it later means changing every
  // reducer's signature
```

**Invariant, enforced by one function (`normalize(nodes): FormulaNode[]`) and never built ad hoc at call sites**: every `FormulaNode[]` array is *strict alternation* — a `TextNode` (possibly `value: ""`) at both ends and between any two compound nodes, never two adjacent `TextNode`s. This single, checkable rule is what replaces `CARET_ANCHOR`: it guarantees there's always exactly one text run to target on either side of the caret, so "caret at start/end of an array" becomes `index === 0` / `index === array.length - 1`, and "the previous/next sibling" is always unambiguous. This is the direct, structural fix for the two shipped `caretAtBoundary` bugs.

`resolve(row, path): { array: FormulaNode[]; index: number } | null` is the *only* function that interprets `Path` structure — everything else (reducers, rendering, selection sync) calls it rather than walking paths by hand. `branchesOf(node): { key: BranchKey; nodes: FormulaNode[] }[]` returns branches in a fixed, explicit order per node type (`[numerator, denominator]` for frac, `[content]` for sqrt/power) — this backs both "enter formula from outside, first/last slot" and the empty-check below, and must not rely on object key order.

## Rendering & selection strategy ("how it aligns with React")

The row stays a real native `contentEditable` div (free focus/IME/mobile-keyboard/accessibility), but React fully owns rendering: `renderNodes(nodes)` in `src/render.tsx` produces real JSX from the tree (no `dangerouslySetInnerHTML`), tagging every rendered element with a `data-path` attribute encoding its `Path`. Every meaningful keystroke gets `event.preventDefault()`'d and dispatched through a pure reducer `(row, caret, action) => { row, caret }` in `src/reducers.ts` — React re-renders from the new tree, then a `useLayoutEffect` converts `{path, offset}` back into a real DOM `Range`/`Selection` by walking the `data-path`-tagged elements (`src/selection.ts`, `pathToDomRange`). This is the **only** place touching `Range`/`Selection` in the write direction, and it's never used for comparison/branching — which is precisely what removes the bug class. Click/pointer handling still uses `caretRangeFromPoint`/`caretPositionFromPoint` for hit-testing, then resolves the DOM hit back to a `Path` via the same `data-path` attributes (`domPositionToPath`), rather than driving the DOM directly.

## Behaviors that must be preserved exactly (traced from current code — not the README, which under-documents several of these)

These are the specific edge cases a fresh reimplementation would very plausibly get "wrong" by making them more sensible. Each needs its own unit test in Stage 2.

- **`/`-auto-fraction term walk** (`insertFractionFromPreviousTerm`, lines 185–233): under the new alternation invariant, "walk backward across sibling text nodes" collapses to a single rule — `previousTerm = trailing match of /[A-Za-z0-9.,]+/ against the current TextNode's value.slice(0, offset)`; empty/no match → insert an empty fraction instead (does not wrap a preceding formula). Note the `"+5"` case: caret after `5` in text `"+5"` still yields term `"5"` (the whole-prefix regex test fails, but the trailing-match still succeeds) — test this specifically.
- **Empty-formula deletion is shallow, not recursive** (`formulaIsEmpty`/`deletionUnits`, lines 510–526): a nested compound counts as "something" in its parent branch *regardless of the nested node's own inner emptiness*. `\frac{\sqrt{}}{}` is not itself empty even though the sqrt is — Backspace deletes the inner empty sqrt first, then on a second Backspace the now-empty fraction. **Never cascade more than one unit per keypress.**
- **Full Backspace/Delete algorithm** (`deleteWithinScope` + friends, lines 476–571) restated for the tree:
  1. Non-collapsed selection *within the same array* → splice out the range, collapse caret to start. Spanning different arrays/branches → no-op (today's real limitation — see below).
  2. `offset > 0` → delete one character from the current TextNode.
  3. `offset === 0`, not at array start → the preceding sibling is a compound node (alternation invariant guarantees this) → delete that **whole node unconditionally**, regardless of its own inner content. Merge the now-adjacent text nodes. Applies at every nesting level.
  4. `offset === 0` **and** at array start → look at the nearest enclosing compound. If shallow-empty *across every one of its branches* → delete that enclosing compound from its own parent. Otherwise **no-op** — e.g. Backspace in an empty numerator does nothing while the denominator still has content. This exact behavior is real (verified via tracing `formulaIsEmpty`/`adjacentDeletionUnit` together) and undocumented; a naive rewrite would likely "fix" it into auto-exiting the formula.
- **`=` jumps to the nearest enclosing formula, not the outermost** (line 338's `.closest`): in `\frac{\sqrt{2}}{}` with caret in the sqrt, `=` lands after the sqrt, still inside the fraction's numerator. In `Path` terms: trim back to just after the *last* compound-node step, not the first.
- **`Enter` always appends a trailing row** (`createRow`, lines 269–275) regardless of caret position — it is not "split row at caret." Preserve verbatim; easy to accidentally "improve."
- **Toolbar insert with an active selection deletes the selection and inserts an empty formula** (line 177) — it does not wrap the selection as content, unlike the `/`-shortcut which does. Keep these two insertion paths behaviorally distinct.
- **Cross-scope range deletion is a no-op today** (`nodeIsInside` check, line 481: both range ends must resolve inside the same scope). The tree model would make real cross-branch deletion tractable for the first time, but that's a product decision, not an incidental win — **replicate today's scope-limited no-op for parity in the cutover**, log full cross-branch selection deletion as a separate future enhancement.
- **Parser fallbacks** (`initialMarkup`, lines 44–88) that `parseLatex` must replicate bit-for-bit: missing `{` after `\sqrt`/`\frac` → literal fallback for the command name; a missing **closing** `}` running to end-of-string is *silently tolerated* as if closed (line 50 only consumes `}` if present, never errors); partial `\frac{numerator}` (no second group) falls back to literal `\frac{` + the *already-recursively-parsed* numerator (which may itself contain real nested nodes) + literal `}` — ordinary sibling nodes in the array, not a special "malformed" node type.
- Add `parseLatex(serializeToLatex(tree))` deep-equals `tree` as a round-trip property test over a generated corpus — cheap, catches a whole class of future regressions.

## File/module plan

Flat `src/`, matching the existing layout, `isolatedModules`-safe:

| File | Responsibility |
| --- | --- |
| `src/model.ts` | Types above; `branchesOf`, `normalize`, `resolve`, node constructors. Pure data. |
| `src/parse.ts` | `parseLatex(line): FormulaNode[]` (tree version of `initialMarkup`); `cleanFormulaText` (shared with insert-time cleaning). |
| `src/serialize.ts` | `serializeToLatex(nodes): string` (tree version of `latexFrom` — simpler, no `CARET_ANCHOR` to strip). |
| `src/reducers.ts` | `Action` union + the pure `(row, caret, action) => {row, caret}` engine: insert text/compound, `/`-auto-fraction, backward/forward delete, caret movement, `=`-nearest-enclosing. |
| `src/render.tsx` | `renderNodes(nodes): ReactNode`, tags every element with `data-path`. Owns the CSS-class contract (`math-input__root`/`fraction`/`power`/`slot--*`) — must stay pixel-compatible with `src/MathInput.css`. |
| `src/selection.ts` | `pathToDomRange` (write), `domPositionToPath` (read), pointer hit-testing. The **only** file touching `Range`/`Selection`/`caretRangeFromPoint`. |
| `src/MathInput.tsx` | Shrinks to props/state/handlers dispatching into `reducers.ts`, row-array CRUD, toolbar/chrome JSX, `EditorIcon`. Stops owning the grammar. |
| `src/model.test.ts`, `parse.test.ts`, `serialize.test.ts`, `reducers.test.ts` | Colocated tests. |

Add `vitest` (+ `jsdom` for anything that needs a DOM shim, though `selection.ts` itself won't be meaningfully testable under jsdom — see risks) as devDependencies, a `test` script, and a `vitest.config.ts`. This is the project's first-ever test infrastructure.

`src/index.ts` keeps exporting only `MathInput`/`MathInputProps` — **do not** export the new model types as public API yet, to preserve freedom to keep adjusting the tree shape without a semver-breaking surface.

## Staged plan

Each stage is independently reviewable/shippable. Recommend a dedicated feature branch with each stage as its own commit, squash-merged at the final cutover — lighter than a permanent flag/parallel component for a project this size (no CI, single maintainer), while still giving clean checkpoints.

**Stage 0 — Model + parse/serialize (zero shipped-behavior risk)**
Build `model.ts`, `parse.ts`, `serialize.ts` with full unit coverage (every parser fallback edge case above, the round-trip property test, `normalize`'s invariant on hand-built malformed input). Nothing wired into the live component — purely additive.

**Stage 1 — Tree-driven rendering, read path only**
Add `render.tsx`; swap the `dangerouslySetInnerHTML` mount to `parseLatex` + `renderNodes`, but row state stays `{id, text}` (tree is *derived*, not yet source of truth) and all editing still goes through the current DOM-mutation code untouched. Proves visual parity before any editing behavior changes.
*Watch for*: real JSX (unlike `dangerouslySetInnerHTML`) is subject to React's reconciler, so if `activeRowId` changes elsewhere re-render this row while the *old* imperative code still owns its DOM, React can clobber those live mutations against its virtual-DOM snapshot. Wrap the row's rendered content in `React.memo` keyed only on `{id, text}` for the duration of this stage. Verify explicitly: edit a row, focus a different row, focus back, confirm the edit survived.

**Stage 2 — Pure reducers, fully unit-tested, not wired in**
Implement every editing operation from the "must preserve" section above as standalone pure functions in `reducers.ts`, tested directly against those traced algorithms (not re-derived from the README, which misses most of them). Also exhaustively unit-test `resolve`/`branchesOf`/`Path` arithmetic. This is where most test coverage should concentrate — everything here is pure and cheap to test.

**Stage 3 — Cutover, split into sub-stages (too large as one shot; can't be split *by operation on the same live row*, since typing/nav can't have split sources of truth without reintroducing the exact desync this rewrite removes — but the *build* can be isolated by risk area before the single flip):**
- **3a — engine skeleton, plain text only.** Row state becomes `{id, content}` for real; wire insert/delete of plain text and row create/remove through the Stage 2 reducers; get the `useLayoutEffect` Path→DOM sync and `data-path` tagging fully working end to end. Validates the highest-uncertainty mechanism (render → sync → re-render loop) in isolation, before compound-node complexity is added. **Also add manual horizontal-scroll-into-view here, not as a follow-up** — `.math-input__field` currently gets free "scroll caret into view" from genuine native input events; a `preventDefault`'d + programmatic `selection.addRange()` does not reliably trigger that, so this needs an explicit rect-comparison + `field.scrollLeft` adjustment.
- **3b — compound nodes + navigation.** Toolbar insert, `/`-auto-fraction, arrow-key in/out/between slots, `=`-nearest-enclosing, the shallow-empty delete cascade. This is where essentially all of the traced edge cases live.
- **3c — native-input impedance layer.** Pointer/click hit-testing (`domPositionToPath`), IME composition, paste. Isolated because it's the most likely to force a design change (see risks) — keeping it separate means a problem here doesn't put 3a/3b's already-working code at risk.
- **3d — flip the switch.** Point the real `MathInput` export at the new engine; delete the old DOM-mutation block entirely (`insert`, `deleteWithinScope`, `advanceFromSlot`, `adjacentMath`, `caretAtBoundary`, `ensureCaretAnchor`, `CARET_ANCHOR`, `placeAtEnd`/`placeAtStart`/`placeBefore`/`placeAfter`, etc.); run the full manual QA matrix (below).

**Stage 4 — Cleanup**
Walk every bullet in the README's "Editing formulas" section and confirm it still holds verbatim (or update the docs for anything intentionally changed); remove any transitional scaffolding (e.g. the Stage-1 `React.memo` wrapper, now unnecessary once Stage 3 owns rendering fully).

## Risk areas the plan must account for

- **IME composition is the single biggest risk, not just "harder than it looks."** A fully `preventDefault`'d keydown-driven reducer *cannot* intercept composed IME text (CJK, dead-key accents) — it arrives via `compositionstart`/`compositionupdate`/`compositionend` and `beforeinput` with `inputType: "insertCompositionText"`, not a preventable keydown; preventing mid-composition `beforeinput` breaks native candidate UI in most browsers. Today's code has *no* composition handling (relies on native + `onInput` cleanup), so this is new work. Design for 3c: let the DOM diverge freely between `compositionstart`/`compositionend` (skip Path→DOM sync during that window), then take the final composed string as one atomic `insertText` action on `compositionend` and resync.
- **Mobile keyboards weaken `keydown` as an interception point** — many mobile IMEs report `keyCode 229`/`key: "Unidentified"`, including for Backspace. `onBeforeInput`'s `inputType` (`insertText`, `deleteContentBackward`, `deleteContentForward`, `insertFromPaste`, `insertCompositionText`, …) is the more reliable cross-platform dispatch point. Make `onBeforeInput` the *primary* mechanism for text insert/delete in 3c; reserve `onKeyDown` for keys with no `beforeinput` equivalent (`^`/`/`/`=`, arrow nav, Enter).
- **Native selection-extension isn't currently intercepted** (`Home`, `Shift+Arrow`, double/triple-click, Ctrl/Cmd+A all fall through to native today — confirmed absent from `onKeyDown`). Under a controlled model these will silently diverge from the Path state until the next resync unless explicitly decided. Make an explicit call in 3b/3c: either give each an explicit reducer action, or deliberately resync `Path` from `domPositionToPath` on `selectionchange` as the fallback — don't let this be an implicit gap.
- **Paste currently always flattens to plain text** (line 374, never uses the parser even though `initialMarkup`/`parseLatex` exists). Preserve that for parity; note that routing paste through `parseLatex` is a natural, low-risk *future* enhancement now that a real tree exists — don't let it sneak into this rewrite as an incidental behavior change.
- **jsdom cannot meaningfully exercise `selection.ts`** — `caretRangeFromPoint`/`caretPositionFromPoint` aren't implemented there, and `Range`/`Selection` support is historically incomplete. This bounds Stage 0/2's unit-test coverage claim; click targeting, IME, and paste verification in 3c are inherently manual/live-browser (Playwright would be the tool if real automation is ever wanted here, but treat that as optional given there's no existing test infra to build on and the manual surface is small and enumerable).

## Verification per stage

- **Stage 0**: `vitest` in plain `node` env (no jsdom needed) — parser grammar incl. all fallback edge cases, round-trip property test, `normalize` invariant on malformed hand-built trees.
- **Stage 1**: manual visual diff against the current component for every construct (sqrt/frac/power, nested, empty slots, placeholder) across a few of the demo's existing `--math-input-*` theme overrides; manually verify the `React.memo` mitigation (edit → switch row focus → switch back → edit survived).
- **Stage 2**: unit tests built directly from the traced algorithms above (not the README) — shallow-empty cascade, adjacent-compound delete regardless of inner content, `=`-nearest-enclosing, term-walk incl. the `"+5"` case, Enter-always-appends. Plus exhaustive `resolve`/`branchesOf` index-arithmetic coverage.
- **Stage 3a/3b**: reducer suite re-run as a regression check against the wired engine; Path→DOM sync needs live-browser verification (jsdom can't exercise it) — use a fixed, repeatable manual checklist in the demo app (it already has a raw-LaTeX-value panel and keyboard log, reuse both) covering type/backspace/delete in every slot type at 2+ nesting levels, every slot-to-slot and formula-to-formula arrow transition, all special keys in/out of slots, Enter/row add/remove.
- **Stage 3c**: purely manual — click targeting at real pointer geometry, IME via an actual OS input method, paste with real clipboard events.
- **Stage 3d/4**: full regression pass of the 3a–3c checklist against the final cutover, plus a line-by-line README behavior-parity check.

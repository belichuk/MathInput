# MathInput 0.6.0 — Design Plan

**Theme:** 0.5.0 made a construct *a row in a table*. 0.6.0 makes a **family** a row — one
`opname` row covering every named function, one `group` row covering every fence — by shipping
the half of the registry that did not: a **datum** on a compound. Everything a user will notice
in this release falls out of that, plus the two pieces of input the last release left owed:
**typing `sqrt`**, and **rows that split and merge**.

Written after 0.5.0 shipped, against the code as it stands at `6352995`. Every number that was
not measured is marked *(estimate)*. Where this plan contradicts an earlier document, this one is
later and the earlier one has been deleted rather than left to be found — see §9.

---

## 1. Scope

| Area | In 0.6.0 |
|---|---|
| Model | `data` on a compound; `ConstructSpec.adopted` becomes optional; an `atom` draw primitive |
| Constructs | Named functions (`sin cos tan log ln lim`), absolute value as a fence datum, Greek letters, relations `< > ≤ ≥ ≠` |
| Input | Token recognition (`sqrt`→√, `sin`→an opname), with Backspace reverting it; row split and merge |
| A11y | Readings for every new construct — a compile error until they exist |
| Docs | The naming rule already documented; the new keys added to the README's key table |

**Out, and deliberately:**

- **Removing the deprecated names.** `autoHideToolbar` / `showOperators` / `showNavigation` and
  `--math-input-control-hover-border` keep working through all of 0.6.x and go in **0.7.0**. A
  host that upgrades to 0.6.0 should not have to change a line.
- **Big operators (∑ ∏ ∫), matrices.** `bigop` needs a two-slot attachment above and below a
  symbol, which is a fifth layout primitive and a new caret story; matrices need indexed slots.
  Both are 0.7.0 at the earliest. The `data` work below is what they will stand on.
- **The toolbar-free entry** — see §7.

---

## 2. The enabling change: a compound carries a datum

**Finding first, because it explains the shape of this release.** The 0.5.0 plan's §2.1 said a
compound would become self-describing: `kind` plus an optional `data` payload, so "one `group`
kind covers `( ) [ ] { } | |` via a fence datum; one `opname` kind covers every function name".
The registry shipped. **The datum did not.** `CompoundNode` in `model.ts` is still five node
types with slots and nothing else, which is why M5 could not start even after Q-3 was answered:
there is nowhere to put the name.

The evidence that this is the missing piece and not a nice-to-have: `render.tsx` already draws
**four** fence shapes — `paren`, `bracket`, `brace`, `bar` — and only `paren` has a construct.
The drawing for absolute value has been in the bundle since M3. What is missing is a field to say
which one a given `group` is.

```ts
// model.ts
export type GroupNode = { type: "group"; content: FormulaNode[]; data?: FenceShape };
export type OpnameNode = { type: "opname"; data: string };   // zero slots; see §4
```

Two consequences in `registry.ts`, both of which the compiler will demand:

1. **`adopted` must become optional.** It is typed `BranchOf<K>`, which for a zero-slot construct
   is `never` — unsatisfiable. An `opname` adopts nothing because it has nothing to adopt into.
2. **`draw` gains an `atom` primitive** — a construct drawn as its own mark with no slot in it.
   It is the fifth primitive and the smallest: a single upright span.

Everything else about a zero-slot compound already works. `branchesOf` returns `[]`,
`buildConstruct` loops over no slots, the caret steps past a construct it cannot enter (invariant
2 holds — a leaf compound simply has nothing to enter), and the alternation invariant is
untouched, because an atom is a compound like any other.

**Acceptance:** `\left|x\right|` and `\sin` round-trip, and the parameterised registry suites pass
for both new rows **with no layer code changed**. If either needs a layer touched, that is a
finding against the registry — stop and fix the table, do not special-case. This is the same
acceptance test M5 carried and never got to run.

---

## 3. Token recognition, and where its memory lives

Typing `sqrt` should give a root. It is the last of M4's seven steps and the only one not done.

**Mechanics.** A `tokens` column on the registry row (`sqrt: ['sqrt', '√']`), matched in the
reducer against the literal characters just typed. Character-based, so a soft keyboard,
dictation and autocorrect all behave identically — the mobile-parity constraint holds by
construction rather than by testing three input methods and hoping.

**Q-4 is answered, and the answer adds no state.** The question was where "Backspace immediately
after recognition reverts to the literal characters" keeps its memory: in `RowState`, where it
would be visible to undo and must not leak into serialisation, or in the shell, which breaks the
single-dispatch story. Neither. **The memory already exists**: `history.ts` tags every entry, and
`history.lastTag` is exactly "what kind of edit was the last one". A recognition records with the
tag `recognise:<rowId>`; Backspace checks that tag and dispatches `undo` instead of `delete` when
it matches. `undo` clears `lastTag`, so a second Backspace deletes normally — which is the
behaviour anyone expects and falls out rather than being written.

No new state, nothing to serialise, invariant 3 intact: the reducer still makes every change, and
the shell only chooses which action to dispatch, which is what it does for every other key.

**The collision worth naming:** `sin` is also three variables. The revert rule is the escape
hatch and it matches every editor's autocorrect-undo instinct, so it needs no discoverability
work — but it does need the test that says a user who wanted three letters can have them.

---

## 4. The constructs

Each is **a registry row plus a LaTeX rule plus a reading**. The reading is not optional: `SPOKEN`
in `speech.ts` is checked against `Record<ConstructKind, Reading>`, so a construct with no reading
does not compile. That is the guarantee working, and it is worth saying out loud that it will
fire during this release rather than being a nicety.

**`opname` — Q-3 is answered: a zero-slot atom carrying a name datum.**

The review wanted a name datum *plus an argument slot*; the 0.5.0 plan wanted zero slots. Zero
slots wins, for three reasons that are about the model rather than about taste:

- `\sin x` is legal LaTeX and `\sin{x}` is not required, so an argument slot would invent a
  structure the exchange format does not have.
- It composes: `sin` then `(` opens an ordinary group, and `s·i·n·(` needs no special case at
  all — token recognition fires on `sin`, then the bracket key does what it always does.
- It deletes as one object, which is what a user means by pressing Backspace after `sin`.

**One detail that will bite if it is not handled first:** `serialize.ts` emits no separating
space, so `\sin` followed by a bare `x` would write `\sinx`, which is not valid LaTeX and which
KaTeX will not render. The precedent is already in the file — `TIMES` serialises as `\cdot ` with
a trailing space — so the `write` rule is `` `\\${node.data} ` `` and `parse.ts` must eat the
space it wrote. Round-tripping `\sin x` is the test that catches this, and it should be written
before the row is.

**Absolute value — a fence datum on `group`, not a new kind.** `|` typed outside a group opens
one with `data: "bar"`; typed inside a bar group it closes it, exactly as `)` already does
through `closedBy`. The drawing exists. What is new is that `closedBy` becomes a function of the
datum rather than a constant on the row.

**Greek letters and relations — characters, not constructs.** `π`, `θ`, `≤`, `≠` live in runs;
the exchange layer maps `\pi` ↔ `π` and `\le` ↔ `≤` both ways. Zero model cost, and the relation
class already exists in the tokeniser — `RELATIONS` in `render.tsx` is `=≠<>≤≥` today, spacing
and reading them correctly for characters no key can yet produce. They are already spoken, too:
`speech.ts` names all six.

---

## 5. Rows that split and merge (Q-6)

`Enter` appends a row after the current one and never splits at the caret; `Backspace` at the
start of a row does nothing. Both are wrong in the same way — a row is not a document, it is a
line — and 0.5.0 named this a known limitation rather than fixing it.

| Key | Where | What it does |
|---|---|---|
| `Enter` | mid-row | Splits at the caret: everything after it becomes the new row, caret at the new row's start |
| `Backspace` | at row start, not the first row | Merges into the row above, caret at the join |
| `Delete` | at row end, not the last row | Merges the row below into this one, caret unmoved |

All three are array surgery on two sequences plus a re-normalisation to restore the alternation
invariant, which `model.ts` already exposes. None of them needs geometry.

**It also closes a hole this release opened.** `toolbar={false}` takes the remove-row control with
it, and with no merge there was then no way to remove a row at all — documented in 0.5.0 as a
limitation to be paired with a single-row field. Once `Backspace` merges, that caveat comes out
of the README.

---

## 6. Milestones

**N0 → N1 is a hard sequence; N2 and N3 may overlap; N4 depends on N1.**

| | Work | Size |
|---|---|---|
| **N0** | `data` on compounds, `adopted` optional, the `atom` primitive, registry column | S |
| **N1** | `opname` and absolute value — the two rows N0 exists for | M |
| **N2** | Greek letters and relations — exchange mappings only | S |
| **N3** | Row split and merge | S–M |
| **N4** | Token recognition and its revert | M |
| **N5** | README, changelog, and the caveat N3 removes | S |

Each ships behind a green suite and is independently revertible, as in 0.5.0. N1's acceptance
test is the one that matters: **no layer code changed.**

---

## 7. Weight

The ratchet in `scripts/size.mjs` currently reads 15.3 KB actual + **0.3 KB allowance**. That
allowance is for this release and it is **not enough**. Stated now rather than discovered at the
gate:

| Work | Estimate |
|---|---|
| `data`, optional `adopted`, `atom` primitive | ~0.15 KB |
| `opname` and absolute value rows, with parse arms | ~0.30 KB |
| Greek and relation exchange maps (~24 pairs both ways) | ~0.40 KB |
| Row split and merge | ~0.25 KB |
| Token recognition and revert | ~0.35 KB |
| **Total** | **~1.45 KB** *(estimate)* |

So the budget wants re-setting to roughly **16.8 KB** when 0.6.0 opens. Two things from 0.5.0's
experience are worth carrying into that number. The estimates that were *made* were good — spoken
math was estimated at 0.70 KB and cost 0.672. The work that was **never estimated** cost the
most, and the gate failed by 46 bytes because of it. So the allowance above should be treated as
a floor for the listed work and not as a ceiling for the release.

**The toolbar-free entry stays pending, and its row should be corrected rather than left
aspirational.** `size.mjs` carries a 10.5 KB budget for `dist/math-input.core.js`, which is not
built and therefore gates nothing. It was measured during 0.5.0 at 1,852 B saved and **255 B over
its own budget** — so the number is wrong as well as unenforced. Now that `toolbar={false}`
exists the *behavioural* need is met and only the bytes remain, which is a much weaker case.
**Recommendation:** leave the entry unbuilt, correct the budget row to the measured figure, and
mark it 0.7.0 — an aspirational number that the code already exceeds is worse than no number.

---

## 8. Open questions

Two, and neither blocks N0.

**R-1 — Does `data` belong on the node or beside it?** This plan puts it on the node
(`{ type: "group", content, data: "bar" }`). The alternative is a parallel table keyed by
address, which keeps the node types uniform at the cost of a second thing to keep in step. On the
node is simpler and matches what the 0.5.0 plan proposed; it is written here so the choice is
visible, not so it is reopened without cause.

**R-3 — Indexed addressing, which has now been deferred twice.** The architecture review's G1
said to generalise a path step from *name* to *name-or-index* **early**, "while the address
format lives in 154 tests and one codebase — not later, when it is serialised into host
expectations and the bridge". A matrix has a variable number of cells and they cannot each carry
a fixed name, so nothing else in the roadmap forces the change and matrices force it completely.
0.5.0 deferred it as Q-5 and was right to for its own reasons — compounds must keep an address,
so shortening the format bought less than that plan assumed. But the *generalisation* is a
separate question from the *shortening*, and only the shortening was actually weighed.

It is now 333 tests rather than 154, and `data-path` is in the DOM where a host can read it. The
cost of the change rises every release and nothing in 0.6.0 needs it. **Recommendation:** decide
it deliberately at 0.7.0 alongside `bigop` and matrices rather than letting it defer a third time
by default — and if it is deferred again, write down what it cost to wait.

**R-2 — Does an opname's reading want the argument?** `\sin x` reads as "sine x" naturally
enough, but `\sin` at the end of a run reads as "sine" and says nothing about what follows.
Speech has no notion of an argument because the model has none. Probably fine; worth a listen
before it ships.

---

## 9. What happened to the other planning documents

The 0.5.0 papers — the design plan, the implementation plan, the review notes, the release note —
were deleted from the working tree when this plan was written, having done their job. They are in
git and can be read at `6352995`, the commit before the cleanup. `architecture.md` stays, because
its §9 invariants are what the whole codebase is written against; it is otherwise pre-registry
and says so at the top.

The five invariants are unchanged by anything above, and §2 in particular is worth re-reading
before N1: a zero-slot construct is the first thing this editor has ever contained that a caret
cannot enter, and "constructs are entered, never landed on" needs to stay true when there is
nothing to enter.

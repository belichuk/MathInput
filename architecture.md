# MathInput — Architecture

> **Written before 0.5.0, and kept for §9.** The invariants in §9 are what the whole codebase is
> written against and are unchanged. The rest of this document describes the component as it was
> at 0.3.7: it predates the construct registry, so §3's layer map and §4's per-layer descriptions
> do not mention `registry.ts`, `speech.ts` or `caret.ts`, and §10's inventory and weights are
> superseded by `npm run size`. Where this document and the code disagree about how a construct
> is declared, the code is right and `src/registry.ts` is the place to read. `Plan.md` carries
> what happens next.

A conceptual description of how the component is put together: what it does, its layers, the
direction data moves through them, the rules that keep the parts from having to know about each
other, and what each part currently weighs.

> **How to read this.** This document is written to be the *only* artifact a reviewer needs —
> there is no code to consult alongside it. Sections 1–9 describe the design, §7 being the
> complete input surface; §10 gives the measured inventory, §11 traces the per-keystroke path in
> operational detail, and §12 states the constraints and where the design is expected to grow.
> Deliberately absent: file names, module paths and identifiers. Layers are named for what they
> do, because the boundaries are the architecture and the files are just where the boundaries
> happen to land.

## 1. What the component does

A React form control for entering mathematical working. The user types into an editable field
and sees a typeset formula; the component emits LaTeX-compatible text and accepts the same as
input. It ships with no runtime dependencies — React and React DOM are peer dependencies — and
no external math renderer or font: everything is drawn by the component itself.

In scope, because each of these shapes the architecture:

- **Structural editing** — roots (square and general index), fractions, powers, subscripts and
  bracket groups, nested arbitrarily, editable with the caret inside any slot at any depth.
- **Multi-row documents** — a document is a list of independently editable lines.
- **Two input worlds** — physical keyboards and soft keyboards, including input-method
  composition, autocorrect substitution and dictation.
- **Pointer editing** — clicking on text, and on structure that has no text under it (a
  fraction bar, a radical, slot padding).
- **Native selection gestures** — modifier-arrow extension, double-click, select-all.
- **A tool strip** — construct, operator and caret-movement buttons for tablet use.
- **Undo/redo**, including the host's own undo affordances.
- **Controlled and uncontrolled use**, with a read-only mode.
- **Host isolation** — keystrokes meant for a formula must not trigger the surrounding
  application's shortcuts.
- **Theming through custom properties**, with no build-time configuration.

### 1.1 The component API

Eleven props, and that is the whole of the JavaScript surface — there is no imperative handle,
no context, no configuration object.

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `value` | `string` | — | Controlled value: one LaTeX-compatible expression per line |
| `defaultValue` | `string` | `""` | Uncontrolled initial value |
| `onChange` | `(value: string) => void` | — | Called with the whole document whenever it changes |
| `placeholder` | `string` | `"Write a formula…"` | Shown in a blank row |
| `disabled` | `boolean` | `false` | Read-only: still renders, selectable and copyable |
| `autoHideToolbar` | `boolean` | `true` | Show a row's tools only while it has focus |
| `showOperators` | `boolean` | `true` | Show the operator group in the tool strip |
| `showNavigation` | `boolean` | `true` | Show the caret-movement group in the tool strip |
| `className` | `string` | `""` | Appended to the root element's class |
| `style` | `CSSProperties` | — | Applied to the root element; the usual way custom properties are set |
| `aria-label` | `string` | `"Math editor"` | Names the editor and, suffixed with a row number, each row |

Observable about this surface, and unresolved: three props govern the tool strip under two
naming schemes (`autoHideToolbar` against `showOperators`/`showNavigation`) with no shared
prefix; there is no switch for the construct group, so the three are not symmetrical; and
`showNavigation` names the group rather than what it does, which is move the caret.

### 1.2 The styling API

Twenty-nine custom properties, all sharing one prefix, consumed by the stylesheet and set by the
host — usually through the `style` prop. Twenty-six carry defaults on the root element:

| Group | Properties |
| --- | --- |
| Typography | `font-family`, `math-font-family`, `field-font-size` |
| Colour — content | `color`, `muted-color`, `placeholder-color` |
| Colour — surfaces | `surface`, `subtle-surface` |
| Colour — borders | `border-color`, `soft-border-color`, `control-hover-border` |
| Colour — accent and controls | `accent-color`, `accent-soft-color`, `control-color`, `control-hover-color` |
| Shape and metrics | `radius`, `control-radius`, `border-width`, `field-padding`, `field-min-height` |
| Radical geometry | `root-stroke-s`, `root-stroke-m`, `root-stroke-l`, `root-width-s`, `root-width-m`, `root-width-l` |

The remaining three are irregular, and knowingly so: `max-width` is honoured but never declared
with the others (it exists only as a fallback where it is read), while `root-stroke` and
`root-width` are internal — set per radical size by the component and not part of the API,
though nothing in the name says so.

Observable about this surface, and also unresolved: `control-hover-border` is the only colour
whose name does not end in `-color`; scope prefixes are mixed, with `field-font-size` and
`field-padding` naming the field while `font-family` and `radius` name the whole component; and
the six radical properties are the only ones exposing a size scale, in a shorthand (`-s`, `-m`,
`-l`) used nowhere else.

## 2. The governing idea

A formula is a **structure**, not a string of characters that happens to look like one. Every
design decision follows from taking that literally.

The component keeps an authoritative, typed **document tree** in its own state, and treats the
editable surface the browser gives it as nothing more than a *projection* of that tree. The
user appears to be editing the page; they are in fact editing the tree, and the page is redrawn
from it. Nothing about the caret, the content, or the meaning of a keystroke is ever decided by
inspecting the rendered document — the tree is asked instead.

This inversion is what buys the properties that matter:

- **A caret cannot land somewhere meaningless.** Positions are addresses in the tree, and the
  set of valid addresses is defined by the model, not discovered by probing the browser.
- **Editing behaviour is testable without a browser.** The rules live in pure functions.
- **The rendering can change freely.** How a radical or a fraction is drawn is a presentation
  concern with no bearing on what the document means.
- **Structural editing is expressible at all.** "Delete this fraction as one object", "make the
  preceding term a base", "step out of this slot" have no natural expression over text.

## 3. Layer map

```
                   ┌─────────────────────────────────────────────┐
   host app  ──────►  Interaction shell (stateful, impure)       │
   (value in)       │  · event interpretation & input policy      │
   (value out) ◄────┤  · row & focus management, history          │
                   │  · toolbar → actions                        │
                   └───┬──────────────┬───────────────┬──────────┘
                       │ actions      │ read/write    │ measure
                       ▼              ▼               ▼
        ┌──────────────────────┐  ┌───────────────────────────┐
        │ Transformation layer │  │  Surface bridge           │
        │  (pure reducers)     │  │  (the only native         │
        └───────┬──────────────┘  │   selection/geometry code)│
                │ uses            └────────────┬──────────────┘
                ▼                              │ addresses
        ┌──────────────────────┐               │
        │ Traversal layer      │               │
        │  (caret arithmetic)  │               │
        └───────┬──────────────┘               │
                │ uses                          │
                ▼                               ▼
        ┌──────────────────────┐  ┌───────────────────────────┐
        │ Document model       │──►  Presentation layer       │
        │  types · invariant   │  │  (pure tree → elements,   │
        │  addressing · paths  │  │   each carrying its       │
        └───────┬──────────────┘  │   own address)            │
                │                 └───────────────────────────┘
                ▼
        ┌──────────────────────┐
        │ Exchange layer       │  reader / writer for the
        │  (tree ⇄ markup)     │  external string format
        └──────────────────────┘
```

Dependencies point downward and inward only. The pure core (model, traversal, transformation,
exchange, presentation) knows nothing about events, the browser, or the host application. The
impure shell knows about all of it and owns none of the rules.

## 4. The layers

### 4.1 Document model — the data structure and its invariant

**The shape.** A document is a list of rows; a row is a **sequence of nodes**. A node is either
a *literal run* — a string of characters — or a **compound**: a construct owning one or more
named child sequences, called slots. All five compounds share that one shape:

| Construct | Slots, in visual order |
| --- | --- |
| Root | index (optional, absent for a square root), radicand |
| Fraction | numerator, denominator |
| Power | base, exponent |
| Subscript | base, subscript |
| Bracket group | content |

So six node kinds in total, over seven distinct slot names. A power owns its base rather than
sitting beside it, which is why raising an existing term to a power is a structural operation
and not an insertion.

**The alternation invariant.** Every sequence strictly alternates literal runs and compounds,
beginning and ending with a literal run — possibly empty. Two compounds are never adjacent
without a run between them. It is restored by normalisation on read and preserved by every
transformation, and its consequence is decisive: *a caret always has exactly one literal run to
sit in*, on either side of any construct, at any depth. There is no such thing as a position
"between two formulas but inside neither". Every edge case that would otherwise need special
handling — placing the caret after a root, before a fraction, in an empty slot — is already an
ordinary position in an ordinary run. The cost is that a sequence holds up to twice as many
nodes as it has visible parts, most of them empty strings.

**Addressing.** A position is an *address* — a walk from the row's sequence downward,
alternating "which node in this sequence" with "which slot of that node" — plus a character
offset into the literal run the address names. Because slot order is a property of a construct's
kind rather than of object key order, the model also owns document-order comparison, so two
arbitrary positions can be ranked without reference to the page. All address arithmetic — the
parent of a position, the address of a slot, equality, ordering — is concentrated here so that
traversal, transformation, rendering and the surface bridge cannot disagree about what an
address means. Addresses are also serialisable to short strings, which is how the rendering
labels itself (§4.5).

**Immutability.** Trees are never mutated. An edit rebuilds only the spine from the row's
sequence down to the changed sequence and shares every untouched subtree, which is what makes
whole-snapshot undo affordable.

### 4.2 Traversal — caret tracking as tree arithmetic

Everything about where the caret is and where it may go next is computed from the tree.

The model's answer to "where is the caret" is one value: an address plus an offset, held in the
component's state as part of a selection (an anchor and a focus, in the order the user dragged
them). That value is the truth; the native selection is a rendering of it, refreshed after every
render (§5.7). Nothing reads the caret back out of the page in order to decide behaviour.

This layer answers movement questions over that representation: the next and previous position
in reading order; into a construct's first or last slot; out of the current slot into the next
one or past the whole construct; to the start or end of a sequence; and the distinct motion of
*stepping past* whatever lies ahead rather than into it — which is what the space bar does,
landing at the far end of the next slot rather than its start, because what is written there is
written and the place to carry on is after it.

Two properties matter for cost. Because of the alternation invariant, "at the end of this run"
is an integer comparison, so no movement measures anything. And because movement is expressed
generically over a construct's ordered slots, a new construct inherits correct navigation by
declaring its slot order and nothing else.

### 4.3 Transformation — every edit as a pure function

The editing rules, expressed as a single reduction: *(row, selection) + intent → (row,
selection)*. Intents are coarse and semantic — eleven of them: insert characters, open a
construct, divide, raise to a power or lower to a subscript, close a bracket, delete in a
direction, move, step past, jump to an edge, select a range. Never "set this character at that
spot".

This layer holds the behaviour a user would describe as the editor being clever:

- **Adoption.** Opening a power, subscript or fraction takes the term already written before the
  caret as its base or numerator; opening a construct in front of written work wraps that work
  instead of pushing it aside. One capture mechanism, parameterised, serves all of it.
- **Where the caret lands.** Each construct declares the slot to open in, plus a different slot
  to open in when there was nothing to adopt — which is why a power raised over an existing term
  opens in the exponent, but one opened from nothing opens in the base.
- **Structural deletion.** A construct standing next to the caret is removed as one object and
  the runs on either side of it merge. At the edge of a slot, an enclosing construct that is
  empty in every slot is removed whole; otherwise the caret steps out rather than destroying
  content the user can still see.
- **Partial range deletion.** A selection covering only part of a construct keeps the construct
  and empties the covered part of each spanned slot — half a fraction is not a thing.
- **Input correction.** A second operator typed after a first replaces it rather than
  accumulating, because two operators in a row are a slip and the later one is the intent. The
  rule is conditioned on what precedes the caret, so a sign opening an expression is still a
  sign.
- **Promotion.** An intent whose meaning is "separate whole expressions" is applied at the
  outermost level regardless of how deeply the caret sits when it is expressed.

Nothing here touches the page, and no rule is duplicated between a key and a button: both
produce the same intent.

### 4.4 Exchange — the format boundary

A reader that turns one line of external markup into a tree, and a writer that turns a tree back
into markup. Isolating the format here means the internal model owes it nothing: several input
spellings normalise to one internal form and one canonical output, and the pair is designed for
round-trip stability, so a value read, rendered and written back is unchanged.

The reader is deliberately tolerant rather than strict — malformed input degrades to literal
text instead of failing — because the input often comes from elsewhere, and a field that refuses
to open is worse than one showing something imperfect.

### 4.5 Presentation — rendering as a pure function, with addresses

Turns a tree into an element tree. Three properties make it more than a formatter.

**Every element carries its own address**, encoded as a short string attribute. The rendering is
simultaneously the view *and* the index that maps between model positions and points on the
page. This single mechanism is what lets the surface bridge stay as thin as it is: there is no
parallel bookkeeping to maintain, because the projection labels itself.

**Structural symbols are drawn, not typeset.** Radicals and brackets are vector drawings that
stretch to the height of what they cover while their stroke weight stays fixed. A character from
a font could not fit as closely and would shift whenever the host changed typeface. Where a
drawn mark must meet a rule drawn by the layout — a radical joining the bar over its content —
the two are constructed from the same measurement, so they are one line by construction rather
than by tuning.

**Presentation decisions are read off the tree.** How heavy a radical should be is chosen from
the structural depth of what it encloses, computed from the document rather than measured from
the page. Rendering therefore stays a pure function of state: nothing is drawn, measured, and
drawn again on every keystroke.

Empty runs render one zero-width character, because a browser gives a range inside a truly empty
element no geometry at all. Blank slots and empty runs are marked in the output so the
stylesheet can show placeholders — styling states are data the renderer emits, not classes
toggled imperatively.

### 4.6 Surface bridge — the only code that speaks to the native selection

Confined to one module, with one rule: **translate, never compare.** It writes a model selection
to the page, reads a page selection back as a model selection, resolves a pointer position to a
model position, and scrolls the caret into view.

What it deliberately does not do is decide behaviour by comparing native positions — the
historical source of boundary-point bugs. Reads are only ever a translation into the model,
after which the model owns the question. Translation snaps to the nearest addressed run, so a
click landing on structure rather than text still yields a valid position. Pointer resolution
adds one piece of intent the browser gets wrong on its own: a click past the edge of a construct
means "carry on after it", not "enter its last slot".

Writing a caret position works by locating the element bearing that address and placing a native
range inside its text node. The bridge also owns the repair path used when the page is briefly
allowed to diverge from state (§6.4).

### 4.7 History — snapshots, cheaply

Undo and redo over whole editor snapshots, affordable precisely because the document is
immutable and neighbouring snapshots share every unchanged subtree. Consecutive edits are tagged
by the kind of edit they are and coalesce when the tags match, so a typed word undoes as a word;
moving the caret ends a run, so undo stops where the user stopped. The stack is capped at 200
entries.

### 4.8 Interaction shell — the stateful edge

The component itself: the only impure layer, and the only one that knows an event loop exists.
Its responsibilities are ordering and translation, not rules.

- **A single dispatch chokepoint.** Exactly one path leads from an event to a new document: read
  the current row, run the reducer, keep the result. Every source of change — keys, buttons,
  pointers, paste, composition, native selection gestures — funnels through it, so there is one
  place where history is recorded and one place where state is replaced.
- **Input read from composed input events, not raw keys.** Editing decisions are made from the
  browser's declared *intent* for an input event rather than from key codes, which is what makes
  a soft keyboard, an autocorrect substitution, a dictated phrase and a physical key the same
  event to the editor. Nine single characters that mean structure rather than themselves are
  looked up in one table and become intents.
- **A keyboard containment policy.** Keys that are part of writing a formula stop at the editor,
  so the surrounding application never fires a shortcut on a keystroke aimed at a formula, and
  their releases are contained too, so a host counting keystrokes never sees half of one.
  Cancelling the default is treated as a separate decision from containment, taken only for keys
  the editor performs itself. Keys the editor has no use for pass through untouched, so focus
  traversal and application shortcuts keep working. Listeners for this policy are attached at
  the editor's own boundary rather than through the framework's delegated events, because a
  policy that must run before the host sees a key cannot run after the event has already passed
  every ancestor.
- **Caret reconciliation after render.** After each render the model's selection is written to
  the page — a no-op when they already agree, which makes the same code path double as a repair
  for stray native movement.
- **Rows and focus.** Row creation and removal, which row currently wears the tools, and moving
  focus to a row when an edit is made from outside it.
- **The controlled/uncontrolled contract.** The last emitted value is remembered, so an incoming
  value equal to it is recognised as an echo and does not rebuild the tree — which is what stops
  a controlled host from fighting the editor.
- **Measurement-driven ornament.** A small amount of state is genuinely geometric — how far a
  row has scrolled, whether the tool strip has wrapped — and is applied directly to the page
  after layout rather than kept in component state, because scrolling a row must not re-render
  its formula. Such adjustments are chosen to be idempotent: they change appearance without
  changing the layout that produced them, so they cannot feed back into themselves.

## 5. The editing cycle

The whole component is one loop, traversed identically no matter where the intent came from:

1. **Something happens** — a key, a button, a pointer, a paste, an incoming value.
2. **The shell classifies it** into a semantic intent, containing or cancelling the native
   behaviour as its policy dictates. If the intent needs a position the page holds, the bridge
   translates that position into the model first.
3. **The reducer applies the intent** to the current row's tree and selection, purely, using
   traversal for anything caret-shaped, and returns a new tree and selection.
4. **History records** the prior snapshot if the document actually changed, coalescing with the
   previous step when both are the same kind of edit.
5. **State is replaced** with the new document; a mirror of it is kept for handlers that need
   the current tree without re-subscribing.
6. **The presentation layer redraws** from the new tree, emitting fresh addresses.
7. **The caret is reconciled** — the model's selection is written to the page and scrolled into
   view.
8. **The exchange layer serialises** the document and, if the result differs from the last value
   published, it is emitted to the host.

Steps 3 through 6 are pure or purely derived; only 1, 2, 7 and 8 touch the outside world. §10
gives the operational cost of one pass.

## 6. Boundary flows

### 6.1 Value in, value out

Incoming markup is split per row and read into trees. Outgoing markup is serialised from the
trees after every change and published only when it differs from the last value published,
suppressing echoes in both directions.

### 6.2 Pointer input

Clicks landing on text are placed by the browser and read back through the bridge. Clicks
landing on structure — a fraction bar, a bracket, a radical, slot padding — have no native caret
position worth having, so they are hit-tested against the addressed elements, resolved to a
model position, and dispatched as a selection intent.

### 6.3 Native selection gestures

Extending a selection with modifier-arrows, double-clicking a word, selecting everything: all
left to the browser, then read back as a model selection rather than each being given its own
intent. The model remains the authority on what is selected; the browser is allowed to be the
input device for saying so.

### 6.4 Composition and other direct writes to the page

Text composition is the one case where the page is deliberately allowed to diverge from state,
because an input method must own the surface until it is finished. When it finishes, the literal
runs are rewritten from the tree — restoring the page to what state says it should be — *before*
the composed text is applied as one ordinary insertion. Restoring first matters: it means the
renderer's next diff is taken against what is really on screen. The same repair runs after any
input that reaches the page without passing through a reducer, so the surface cannot drift.

### 6.5 Styling

The visual contract is entirely custom properties consumed by the stylesheet: a host themes the
field by setting values, not by overriding rules. Sizes are expressed relative to the inherited
type size, so a formula scales with its surroundings.

## 7. Input surface — keys, gestures and affordances

Everything the editor responds to today, stated in full because this is the part of the design
most exposed to judgement: all of it is a choice, and several of the choices are open.

### 7.1 Characters that mean structure

| Key | Meaning |
| --- | --- |
| `/`, `÷` | Open a fraction, taking the term before the caret as its numerator; the caret goes to the denominator. With nothing before it, the caret waits in the numerator. |
| `^` | Raise the preceding term to a power; caret in the exponent. |
| `_` | Lower the preceding term to a subscript; caret in the subscript. |
| `(` | Open a bracket group, wrapping the term that follows the caret if there is one. |
| `)` | Leave the bracket group the caret is in; a literal character only when it is not in one. |
| `=` | Promoted out to the row and written after the whole expression, wherever the caret sits. |
| `*`, `×`, `·` | All normalised to a raised dot, emitted as the multiplication command. |
| `:` | Division sign, written as a character — the inline form of a fraction. |
| Space | Step *past* what is in front of the caret rather than into it: to the end of the current run, then over a whole construct, then out of the slot, landing at the end of the next slot. |

Everything else typed is inserted literally, with one correction rule: an operator typed
directly after another replaces it, because two in a row are a slip rather than an expression.

### 7.2 Movement, editing and containment

| Key | Behaviour |
| --- | --- |
| ← → | One position in reading order, entering and leaving constructs |
| Shift + arrows | Left to the browser, then read back as a model selection |
| Home / End | Start or end of the row |
| Backspace / Delete | Structural: a construct beside the caret goes as one object; at a slot edge an empty construct is removed and a non-empty one is stepped out of |
| Enter, Shift + Enter | New row |
| Escape | Leave the field, on release rather than press |
| Cmd/Ctrl + Z, ⇧Z, Ctrl + Y | Undo and redo |
| ↑ ↓ | **Not handled** — left to the browser, and whatever position results is read back and snapped to the nearest run |
| Tab | **Not handled** — deliberately left to move focus out of the field |

Keys the editor uses are contained at its boundary, presses and releases alike, so the host
application never fires a shortcut on a keystroke aimed at a formula. Cancelling the browser's
default is a separate decision, taken only for keys the editor performs itself; select-all, copy
and application shortcuts stay native.

Gaps, stated rather than defended: **no key opens a root** — it exists only as a tool button;
**vertical arrows have no defined meaning**, so moving between numerator and denominator, or
between rows, has no keyboard expression; and **Tab does not walk a formula's slots**, which is
how most equation editors move between them.

### 7.3 Pointer, tools and affordances

- Clicking text places the caret natively; clicking structure with no text under it is hit-tested
  against the addressed elements, and a click past a construct's edge means "carry on after it"
  rather than "enter its last slot".
- The tool strip holds eleven tools in three groups — constructs, operators, caret movement —
  each emitting the same intent as its keyboard equivalent and each declining to take focus from
  the row it acts on. It can auto-hide to the focused row, and its operator and movement groups
  can be switched off by the host.
- Empty slots show a dotted placeholder; a blank row shows a placeholder string.
- A row scrolls horizontally rather than wrapping, with a drawn indicator that can be dragged
  without disturbing the caret in another row.
- A disabled field still renders, and can be selected and copied from.
- Rows are added and removed from the strip.

## 8. Sub-components

Below the shell the tree of parts is deliberately shallow:

- **The editable surface** — one per row: an editable region whose entire content is the
  projection of that row's tree, carrying the identity and state attributes the stylesheet, the
  bridge and assistive technology read.
- **The tool strip** — eleven tools in three groups, separated by dividers: constructs that must
  be built, operators that are only characters (offered because formulas are written on tablets
  as often as on keyboards), and caret movement for hands that are not on the arrow keys. Each
  button is a pure emitter of the same intent the corresponding key produces, and does not take
  focus from the row it acts on. Groups are individually switchable, and the strip degrades
  gracefully when it wraps.
- **Row affordances** — adding and removing rows, presented with the strip.
- **The overlay scroll indicator** — drawn rather than native, so a row's height never changes
  as its formula outgrows the line, and draggable to scroll one row without disturbing the caret
  in another.
- **The icon set** — a single primitive rendering either filled outlines or drawn strokes, so
  glyphs lifted from a typeface and marks written for the editor coexist in one component.
- **The recursive node renderer** — one case per construct, each delegating its slots back to the
  sequence renderer.

## 9. Patterns and invariants

| Pattern | Where it shows up |
| --- | --- |
| Functional core, imperative shell | Pure model/traversal/transformation/exchange/presentation; one stateful component around them |
| Unidirectional data flow | Intent → reducer → state → render → reconcile; no back-channel from page to document |
| Single writer | Exactly one dispatch path may change the document or the caret |
| Normalised representation | The alternation invariant, restored on read and preserved by every edit |
| Structural addressing | One address scheme shared by model, renderer and bridge |
| Self-describing projection | The rendering *is* the position index |
| Anti-corruption boundary | External markup confined to the exchange layer; native selection confined to the bridge |
| Translate, never compare | The bridge converts positions; it never derives behaviour from page geometry |
| Declarative styling contract | Custom properties and emitted state attributes instead of imperative class toggling |
| Persistent data structures | Structural sharing makes whole-snapshot history cheap |
| Capability-agnostic input | Behaviour keyed to declared input intent rather than key identity or device |

Invariants worth stating outright, because most of the code depends on them:

1. Every sequence alternates literal runs and constructs, starting and ending with a run.
2. Every caret position names a literal run; constructs are entered, never landed on.
3. The document is only ever changed by a reducer, and only through the single dispatch path.
4. No editing decision is made by measuring or comparing anything on the page.
5. Rendering is a pure function of the document — the same tree always draws the same way.

## 10. Inventory and weight

Measured from the published build. Per-layer figures are derived from the bundle's source map,
so they are shares of real emitted output rather than estimates from source size.

| Layer | Source lines | Shipped JS | Share |
| --- | --- | --- | --- |
| Interaction shell | 565 | 15.9 KB | 41.2% |
| Transformation (reducers) | 346 | 7.2 KB | 18.7% |
| Surface bridge | 162 | 3.6 KB | 9.2% |
| Document model | 184 | 3.6 KB | 9.2% |
| Presentation | 121 | 3.3 KB | 8.4% |
| Exchange — reader | 133 | 2.0 KB | 5.2% |
| Traversal | 124 | 2.0 KB | 5.1% |
| History | 38 | 0.6 KB | 1.6% |
| Exchange — writer | 22 | 0.5 KB | 1.3% |
| **Attributed total** | **1,695** | **38.6 KB** | |

Totals and packaging:

| Fact | Value |
| --- | --- |
| Shipped ESM bundle | 43.5 KB raw, **12.8 KB gzipped** |
| Unattributed remainder | 3.9 KB (module glue, shared helpers, JSX plumbing) |
| Same bundle, re-minified with a modern minifier | 32.2 KB raw, **11.4 KB gzipped** |
| Stylesheet | 470 lines, 54 rule blocks, 8.5 KB raw, **2.1 KB gzipped** |
| Custom properties forming the theming API | 29 |
| Runtime dependencies | none (React, React DOM and the JSX runtime are external) |
| Formats published | ESM + CJS, with types emitted separately |
| Stylesheet delivery | extracted to its own file, consumed by the host through a subpath import, declared as the package's only side-effectful file |
| Icon payload inside the interaction shell | 10 embedded outline path strings, ≈2.4 KB of source characters |
| Drawn structural symbols (radical, brackets) | 3 path strings, ≈81 characters total |
| Node kinds / slot names / intents / tools | 6 / 7 / 11 / 11 |
| Undo stack cap | 200 snapshots |
| Test count | 154 |

Two facts worth reading together: the published bundle is name-mangled and comment-stripped but
still pretty-printed, and re-minifying it saves 1.4 KB gzipped — so roughly a tenth of the
shipped payload is whitespace that most hosts' own build steps will remove, but not all of them
will.

## 11. The keystroke path, concretely

What one ordinary character typed into a focused row actually costs, in order. This is the hot
path; everything else in the component is cold by comparison.

1. **Containment** — a key-down handler at the editor boundary decides whether the key belongs
   to the editor: a few string comparisons, plus recording the key so its release can be
   contained too.
2. **Classification** — the input event's declared intent is read, and single characters are
   looked up in the structural-intent table. One map lookup.
3. **Reduction** — the caret's address is resolved down the tree, the literal run it names is
   sliced and rebuilt with the new character, and the spine from the row's sequence to that run
   is rebuilt immutably. Sequences on the path are copied; every untouched subtree is shared.
   Proportional to the *depth* of the caret and the *width* of the sequences on its path, not to
   the size of the document.
4. **History** — either the previous snapshot is pushed (copying the undo array, capped at 200)
   or, when this keystroke coalesces with the last, only the tag is updated.
5. **Render** — state is replaced, and the editor re-renders. There is no memoisation anywhere:
   every node of every row is re-created as an element, and each element's address is re-encoded
   into a string attribute. Proportional to the size of the whole document, on every keystroke.
   The framework's own diff then decides what actually changes in the page, which is where the
   real DOM cost is avoided — the element tree is rebuilt, the page mostly is not.
6. **Caret reconciliation** — a layout effect locates the element bearing the caret's address
   with an attribute query, compares the resulting point with the current native selection, and
   sets it if it differs. When it moved, the caret's rectangle and the field's rectangle are
   read to decide whether to scroll it into view — **a forced layout read**.
7. **Ornament synchronisation** — a second layout effect reads each row's scroll metrics and
   writes its indicator's geometry, then reads each divider's offsets to decide whether the tool
   strip has wrapped — **more forced layout reads**, once per row and once per divider, after
   every render rather than only on resize. A resize observer runs the same pass.
8. **Publication** — the entire document is serialised to a string and compared with the last
   value published; if it differs, the host's change handler is called. Proportional to the size
   of the whole document, on every keystroke.

So three things scale with document size per keystroke — the element rebuild, the serialisation,
and the ornament pass over all rows — while the actual edit scales only with caret depth. Layout
is read at least twice per keystroke. Known ceilings: a very long single row (the element rebuild
and the scroll-indicator maths), a document with many rows (the per-row ornament pass), and deep
nesting (address encoding, which grows with depth for every node rendered).

## 12. Constraints, non-goals and intended growth

Held throughout, and to be respected by any change:

- **No runtime dependencies, and no external math renderer or font.** The component draws its
  own structural symbols, which is why presentation is a first-class layer rather than a wrapper.
- **Peer-dependency React only**, supporting two major versions.
- **One theming API: custom properties.** No build-time configuration, no CSS-in-JS runtime, no
  required class overrides.
- **Purity of the core layers.** The document, its traversal, its transformations, its
  serialisation and its rendering must stay free of the DOM, so the behavioural rules remain
  testable without a browser.
- **Mobile parity.** Anything keyed to physical key identity rather than declared input intent
  is a regression on soft keyboards, input methods and dictation.
- **Host isolation.** The editor must not leak formula keystrokes to the surrounding
  application, nor swallow keys the application needs.

### 12.1 Where the design is expected to grow

Two expectations the architecture is meant to satisfy, and which a review should test it
against — they are the reason the layering exists at all:

- **A widening KaTeX-compatible subset.** The five constructs today are a starting set, not the
  destination. The emitted string must stay KaTeX-renderable, and the model, traversal,
  transformation, rendering and exchange layers must absorb further constructs — sums and
  integrals with their limits, functions and roots taken by name, absolute value, mixed numbers,
  inequalities, Greek letters, matrices — by *declaring* them rather than by special-casing
  them. Where a construct would not fit the current shape (a compound of named slots, with the
  alternation invariant holding inside each), that is a finding worth having early.
- **The same editor at both ends of the scale.** A two-character answer and a deeply nested
  expression must both feel right: the small case must stay light — no cost paid for machinery
  it never uses — and the complex case must stay responsive, legible when nested several levels
  deep, and navigable without the caret becoming a guessing game.

Explicit non-goals: rendering arbitrary TeX (macros, environments, document structure); a
plug-in system for third-party constructs; right-to-left layout; and collaborative editing.

## 13. Extending it

Adding a construct is a bounded exercise touching exactly four layers and no others:

1. **Model** — declare its kind, its slots and their visual order. Navigation, document order,
   normalisation, range deletion and immutable update all follow generically from that
   declaration.
2. **Exchange** — one reading rule and one writing rule.
3. **Presentation** — one rendering case and its styling.
4. **Interaction** — optionally, a key that means it and a tool that inserts it, both expressed
   as the intent the transformation layer already understands.

Adding an *operation* on existing constructs touches only the transformation layer, plus the key
or button that expresses the intent. Changing how something looks touches only the presentation
layer and the stylesheet.

## 14. Testing seams

The layering is what makes coverage cheap, and each seam is tested where its rules live —
154 tests in total, the large majority of them running without a DOM:

- **Model and traversal** — plain functions over trees: invariants, addressing, comparison,
  every movement.
- **Transformation** — the entire behavioural specification of the editor, as data in and data
  out, with no browser involved. This is where the editor's semantics are pinned.
- **Exchange** — round-trip stability and tolerance of malformed input.
- **Presentation** — that every emitted address resolves in the tree it was rendered from (the
  contract the bridge depends on), that the class contract the stylesheet is written against
  exists, and that presentation choices derived from structure are the intended ones.
- **Interaction** — a small number of rendered-component tests for the parts that only exist
  once events, focus and layout are real: the tool strip, its configuration, and the containment
  policy.

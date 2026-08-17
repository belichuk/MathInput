# Start here — MathInput 0.5.0

Paste the block below into a fresh session to begin implementation.

---

```
Implement MathInput 0.5.0, starting at M0.

Read /Users/mbelichu/project/MathInput/mathinput-0.5.0-implementation.md first —
it's a 606-line plan written for exactly this, by someone with no memory of the
session that produced it. Everything you need is either in it or named by
file:line. Read Part II (Ground truth) carefully before trusting anything in the
older documents: mathinput-0.5.0-plan.md and mathinput-review-plan.md both
contain claims that were verified false, and Part II §2.3 lists all eight.

Start with M0 (Part IV), then M1. Neither depends on the four open reviewer
questions in Part III, so don't wait on those — the fallbacks are written down.
M0 → M1 → M2 is a hard sequence; do not start M2 until M1's acceptance criteria
are met.

M0 delivers: a gzip size gate wired into CI, a keystroke benchmark with a
forced-layout counter over three fixtures, a KaTeX side-by-side reference page in
the demo (KaTeX as a demo devDependency only — it must never enter the package),
and an "## Unreleased" CHANGELOG section. Prove the harness works by asserting the
CURRENT baseline of 2 + 7R + 3D layout reads per keystroke before M1 changes it.

M1 delivers the diet and hot path with zero behaviour change: all 154 existing
tests must pass untouched. Target exactly 1 forced layout per keystroke and
~10.8 KB gz. Note step 7 — write the first selection.ts tests during M1, not
later; it's the untested module every later milestone touches.

Constraints that are not negotiable: no runtime dependencies, no shipped font or
math renderer, KaTeX-renderable output, pure core, mobile/soft-keyboard/IME
parity, and the five invariants in architecture.md §9 — especially invariant 4,
that no editing decision is made by measuring the page.

Already decided, don't reopen: one release (no 0.4.x); the registry is a
declarative table keeping the typed union, not generic Record slots; behaviour
wins over bytes; Tab walks slots and exits at the last one.

Ask me before: pushing any tag (npm publish and the GitHub release are triggered
by it, and v0.3.5–v0.3.7 are still unpushed), and before committing anything.

Measured baseline to compare against is in Appendix C.
```

---

## Before that session

Send the four **blocking** questions in Part III of the implementation plan to the reviewer, so
answers arrive while M0 and M1 are underway. They gate M2 and M3, not M0/M1 — but M2 starts in
roughly a week.

1. What is the concrete shape of `ReadRule` / `WriteRule`?
2. How does run tokenisation coexist with the caret bridge?
3. `opname` — zero-slot atom, or name datum plus argument slot?
4. Where does token-revert state live, given the pure core?

## Document map

| File | What it is |
|---|---|
| `architecture.md` | The component described abstractly — the reviewer's only evidence |
| `request-plan.md` | The review brief: four ranked priorities |
| `mathinput-review-plan.md` | The blind review's findings and seven-stage plan |
| `mathinput-0.5.0-plan.md` | The 0.5.0 design — **contains verified-false premises; see Part II §2.3** |
| `mathinput-0.5.0-implementation.md` | **The executable plan.** Start here |
| `mathinput-0.5.0-begin.md` | This file |

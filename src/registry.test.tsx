// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type CaretPosition, type FormulaNode, branchKeys, buildConstruct, collapsedAt, decodePath, encodePath, isNormalized, normalize, resolve, resolveArray, text } from "./model";
import { type ConstructKind, KEY_INSERTIONS, TOOL_INSERTIONS, specOf } from "./registry";
import { type Action, reduce } from "./reducers";
import { nextPosition, rowStart } from "./caret";
import { parseLatex } from "./parse";
import { serializeToLatex } from "./serialize";
import { renderNodes } from "./render";
import { CONSTRUCT_KINDS, corpusOf, kindsIn, latexOf, rowOf, top } from "./testing";

/**
 * Every property, over every row of the registry.
 *
 * This file is the milestone's real acceptance test, and the thing to understand about it is
 * that **it names no construct anywhere**. It draws its kinds from `CONSTRUCT_KINDS`, which is
 * the table's own keys, and its trees from a generator that builds slots by asking the table
 * what slots there are. So adding a row to `registry.ts` does not merely make a new construct
 * work — it subjects that construct to all of this, without a line here being touched.
 *
 * That is what the release is for. Before it, a new construct meant editing seven files and
 * hoping none had been missed; the way it was *found* that the adoption rule had two
 * independent implementations was reading them side by side. A property that runs over the
 * table cannot miss one.
 *
 * Note the round-trip property in particular. `parse.ts` is still hand-written — the registry
 * declares how a construct is written and not how it is read, which is the recorded limit of
 * this milestone — so a row added without a matching arm in the parser will fail
 * `is read back as the construct it was written from` rather than fail silently. The table
 * cannot guarantee that layer, so the tests hold it instead.
 */

const everyPosition = (content: FormulaNode[], cap = 60): CaretPosition[] => {
  const positions: CaretPosition[] = [];
  let position: CaretPosition | null = rowStart();
  while (position && positions.length < cap) {
    positions.push(position);
    position = nextPosition(content, position);
  }
  return positions;
};

/** The slot a caret is inside: the branch named by the step above the run it sits in. */
const slotOfCaret = (position: CaretPosition) => position.path[position.path.length - 2]?.branch;

const filledSlots = (kind: ConstructKind) => Object.fromEntries(specOf(kind).slots.map((slot) => [slot.key, [text("1")]]));

/** Every editing action that can change a row, so no position escapes any of them. */
const EDITS: Action[] = [
  { type: "insertText", text: "7" },
  { type: "insertText", text: "-" },
  { type: "delete", direction: "backward" },
  { type: "delete", direction: "forward" },
  { type: "divide" },
  { type: "script", kind: "power" },
  { type: "script", kind: "subscript" },
  { type: "insertCompound", kind: "sqrt" },
  { type: "insertCompound", kind: "group" },
  { type: "closeGroup" },
  { type: "equals" },
  { type: "skip" },
];

describe("every construct in the registry", () => {
  it.each(CONSTRUCT_KINDS)("%s — is exactly the slots it declares, in the order it declares them", (kind) => {
    const spec = specOf(kind);
    const keys = spec.slots.map((slot) => slot.key);
    expect(branchKeys(buildConstruct(kind, filledSlots(kind)))).toEqual(keys);
    // An optional slot left out is absent rather than empty, so it is not a branch at all —
    // which is how a plain square root has one slot and a root with an index has two.
    expect(branchKeys(buildConstruct(kind))).toEqual(spec.slots.filter((slot) => !slot.optional).map((slot) => slot.key));
    // Each slot has a name the stylesheet can use, and no two of them share it.
    const codes = spec.slots.map((slot) => slot.code);
    expect(codes.filter(Boolean)).toHaveLength(codes.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each(CONSTRUCT_KINDS)("%s — adopts a preceding term into one of its own slots", (kind) => {
    expect(specOf(kind).slots.map((slot) => slot.key)).toContain(specOf(kind).adopted);
  });

  it.each(CONSTRUCT_KINDS)("%s — pairs its slots vertically without ambiguity", (kind) => {
    const keys = specOf(kind).slots.map((slot) => slot.key);
    const pairs = specOf(kind).vertical ?? [];
    for (const [above, below] of pairs) {
      expect(keys).toContain(above);
      expect(keys).toContain(below);
      expect(above).not.toBe(below);
    }
    // One step up and one step down from any slot, so ↑ and ↓ are functions rather than choices.
    expect(new Set(pairs.map(([above]) => above)).size).toBe(pairs.length);
    expect(new Set(pairs.map(([, below]) => below)).size).toBe(pairs.length);
  });

  it.each(CONSTRUCT_KINDS)("%s — is read back as the construct it was written from", (kind) => {
    for (const tree of corpusOf(kind)) {
      const latex = serializeToLatex(tree);
      const back = parseLatex(latex);
      // A construct whose row has no arm in `parse.ts` comes back as the literal characters
      // of its own command. This is the assertion that says so out loud.
      expect(kindsIn(back), latex).toContain(kind);
      expect(serializeToLatex(back), latex).toBe(latex);
      expect(isNormalized(back), latex).toBe(true);
    }
  });

  it.each(CONSTRUCT_KINDS)("%s — leaves the row alternating after any edit at any position", (kind) => {
    for (const tree of corpusOf(kind, 4)) {
      for (const position of everyPosition(tree, 24)) {
        for (const action of EDITS) {
          const next = reduce({ content: tree, selection: collapsedAt(position) }, action);
          expect(isNormalized(next.content), `${serializeToLatex(tree)} at ${encodePath(position.path)}+${position.offset} on ${action.type}`).toBe(true);
        }
      }
    }
  });

  it.each(CONSTRUCT_KINDS)("%s — gives every address it renders a node in the tree it came from", (kind) => {
    for (const tree of corpusOf(kind, 8)) {
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(<>{renderNodes(tree)}</>);
      const addressed = [...host.querySelectorAll<HTMLElement>("[data-path]")];
      expect(addressed.length).toBeGreaterThan(0);
      for (const element of addressed) {
        const path = decodePath(element.dataset.path!);
        const target = element.classList.contains("math-input__slot") ? resolveArray(tree, path) : resolve(tree, path);
        expect(target, `${serializeToLatex(tree)} → ${element.dataset.path}`).not.toBeNull();
      }
    }
  });

  it.each(CONSTRUCT_KINDS)("%s — can be reached in every slot from outside itself", (kind) => {
    const content = normalize([text("a"), buildConstruct(kind, filledSlots(kind)), text("b")]);
    // Walking forwards from the start of the row, with nothing but →, must visit every slot.
    const visited = new Set(everyPosition(content).map(slotOfCaret).filter(Boolean));
    expect([...visited].sort()).toEqual(specOf(kind).slots.map((slot) => slot.key).sort());
  });

  it.each(CONSTRUCT_KINDS)("%s — is deleted as one object", (kind) => {
    const content = normalize([text("a"), buildConstruct(kind, filledSlots(kind)), text("b")]);
    // Backspace from the run just after it: the whole construct goes and the runs either side
    // become one, however much was written inside it.
    const next = reduce({ content, selection: collapsedAt({ path: [{ index: 2 }], offset: 0 }) }, { type: "delete", direction: "backward" });
    expect(latexOf(next)).toBe("ab");
    expect(kindsIn(next.content).has(kind)).toBe(false);
  });
});

/**
 * The triggers, which are not the constructs: the same fraction opens differently from `/` than
 * from the toolbar, so the policy is the trigger's and the adopted slot is the construct's.
 */
const TRIGGERS = [
  ...Object.entries(TOOL_INSERTIONS).map(([kind, insertion]) => ({ name: `the ${kind} tool`, action: { type: "insertCompound", kind } as Action, insertion })),
  { name: "the / key", action: { type: "divide" } as Action, insertion: KEY_INSERTIONS.divide },
  { name: "the ^ key", action: { type: "script", kind: "power" } as Action, insertion: KEY_INSERTIONS.power },
  { name: "the _ key", action: { type: "script", kind: "subscript" } as Action, insertion: KEY_INSERTIONS.subscript },
];

describe("every trigger in the registry", () => {
  it.each(TRIGGERS)("$name builds the construct its row names", ({ action, insertion }) => {
    expect(kindsIn(reduce(rowOf(""), action).content)).toContain(insertion.kind);
  });

  it.each(TRIGGERS)("$name leaves the caret in the slot its row names", ({ action, insertion }) => {
    // With nothing in front of it there is no term to adopt, so the fallback slot applies —
    // which is what stops `/` on an empty row waiting under a numerator nothing can fill.
    const empty = reduce(rowOf(""), action);
    expect(slotOfCaret(empty.selection.focus)).toBe(insertion.caretWithoutTerm ?? insertion.caret);

    const afterTerm = reduce(rowOf("7", top(0, 1)), action);
    expect(slotOfCaret(afterTerm.selection.focus)).toBe(insertion.adopts ? insertion.caret : insertion.caretWithoutTerm ?? insertion.caret);
  });

  it.each(TRIGGERS)("$name adopts the preceding term into the construct's adopted slot, or nothing at all", ({ action, insertion }) => {
    const state = reduce(rowOf("7", top(0, 1)), action);
    const built = state.content.find((node) => node.type === insertion.kind);
    expect(built, latexOf(state)).toBeDefined();
    const adopted = specOf(insertion.kind).adopted;
    const held = serializeToLatex((built as never as Record<string, FormulaNode[]>)[adopted] ?? []);
    // A trigger that adopts took the 7; one that does not left it where it was written.
    expect(held).toBe(insertion.adopts ? "7" : "");
    expect(latexOf(state)).toContain("7");
  });

  it.each(TRIGGERS)("$name leaves the row alternating", ({ action }) => {
    for (const latex of ["", "7", "1+2", "\\frac{1}{2}", "x^{2}"]) {
      for (const position of everyPosition(parseLatex(latex), 12)) {
        const next = reduce({ content: parseLatex(latex), selection: collapsedAt(position) }, action);
        expect(isNormalized(next.content), `${latex} at ${encodePath(position.path)}+${position.offset}`).toBe(true);
      }
    }
  });
});

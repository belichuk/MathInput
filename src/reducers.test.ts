import { describe, expect, it } from "vitest";
import { type TextNode, encodePath, isNormalized, isText, resolve } from "./model";
import { type Action, type CompoundKind, type RowState, reduce } from "./reducers";
import { at, inside, latexOf, rowOf, rowSelecting, sketch, top } from "./testing";

/**
 * Every reducer result is checked against the model's invariants, not just its own
 * expectation: the array must stay strictly alternating and the caret must land inside a
 * real text run. Those two properties are what the whole rewrite rests on.
 */
function apply(state: RowState, ...actions: Action[]): RowState {
  return actions.reduce((current, action) => {
    const next = reduce(current, action);
    expect(isNormalized(next.content), `alternation broken by ${action.type}: ${latexOf(next)}`).toBe(true);
    for (const position of [next.selection.anchor, next.selection.focus]) {
      const target = resolve(next.content, position.path);
      const node = target?.array[target.index];
      expect(isText(node), `${action.type} left the caret off a text run at ${encodePath(position.path)}`).toBe(true);
      expect(position.offset, `${action.type} left the caret past the end of its run`).toBeLessThanOrEqual((node as TextNode).value.length);
    }
    return next;
  }, state);
}

const type = (text: string): Action => ({ type: "insertText", text });
const del = (direction: "backward" | "forward" = "backward"): Action => ({ type: "delete", direction });

describe("insertText", () => {
  it("types into an empty row", () => {
    expect(sketch(apply(rowOf(""), type("1"), type("2")))).toBe("12|");
  });

  it("types into a slot", () => {
    expect(sketch(apply(rowOf("\\sqrt{}", inside(1, "content", 0)), type("9")))).toBe("\\sqrt{9|}");
  });

  it("shows multiplication as × and ignores spaces", () => {
    expect(sketch(apply(rowOf(""), type("2"), type("*"), type(" "), type("3")))).toBe("2\\times 3|");
  });

  it("replaces the selection it is typed over", () => {
    expect(sketch(apply(rowSelecting("123", top(0, 1), top(0, 2)), type("9")))).toBe("19|3");
  });
});

describe("the / key", () => {
  it("makes the preceding number the numerator and moves to the denominator", () => {
    expect(sketch(apply(rowOf("10", top(0, 2)), { type: "divide" }))).toBe("\\frac{10}{|}");
  });

  it("takes only the term, not the operator before it", () => {
    expect(sketch(apply(rowOf("+5", top(0, 2)), { type: "divide" }))).toBe("+\\frac{5}{|}");
  });

  it("takes the whole formula when one sits directly behind the caret", () => {
    expect(sketch(apply(rowOf("\\frac{1}{2}", top(2, 0)), { type: "divide" }))).toBe("\\frac{\\frac{1}{2}}{|}");
  });

  it("inserts an empty fraction, caret in the numerator, when there is no term to take", () => {
    expect(sketch(apply(rowOf("1+", top(0, 2)), { type: "divide" }))).toBe("1+\\frac{|}{}");
    expect(sketch(apply(rowOf(""), { type: "divide" }))).toBe("\\frac{|}{}");
  });

  it("splits a run at the caret rather than at its end", () => {
    expect(sketch(apply(rowOf("12+34", top(0, 2)), { type: "divide" }))).toBe("\\frac{12}{|}+34");
  });

  it("replaces a selection with an empty fraction", () => {
    expect(sketch(apply(rowSelecting("123", top(0, 0), top(0, 3)), { type: "divide" }))).toBe("\\frac{|}{}");
  });
});

describe("the ^ and _ keys", () => {
  it("adopts the preceding term as the base", () => {
    expect(sketch(apply(rowOf("10", top(0, 2)), { type: "script", kind: "power" }))).toBe("10^{|}");
    expect(sketch(apply(rowOf("x", top(0, 1)), { type: "script", kind: "subscript" }))).toBe("x_{|}");
  });

  it("adopts a whole formula as the base", () => {
    expect(sketch(apply(rowOf("\\sqrt{2}", top(2, 0)), { type: "script", kind: "power" }))).toBe("\\sqrt{2}^{|}");
  });

  it("nests, so x_i squared keeps both scripts", () => {
    expect(sketch(apply(rowOf("x_{i}", top(2, 0)), { type: "script", kind: "power" }))).toBe("x_{i}^{|}");
  });

  it("leaves the base empty when there is nothing in front", () => {
    expect(sketch(apply(rowOf(""), { type: "script", kind: "power" }))).toBe("^{|}");
    expect(sketch(apply(rowOf("1+", top(0, 2)), { type: "script", kind: "power" }))).toBe("1+^{|}");
  });

  it("keeps typing inside the exponent", () => {
    expect(sketch(apply(rowOf("2", top(0, 1)), { type: "script", kind: "power" }, type("10")))).toBe("2^{10|}");
  });
});

describe("toolbar insertion", () => {
  const insert = (kind: CompoundKind): Action => ({ type: "insertCompound", kind });

  it("inserts an empty formula with the caret in its first slot", () => {
    expect(sketch(apply(rowOf(""), insert("sqrt")))).toBe("\\sqrt{|}");
    expect(sketch(apply(rowOf(""), insert("frac")))).toBe("\\frac{|}{}");
    expect(sketch(apply(rowOf(""), insert("cubeRoot")))).toBe("\\sqrt[3]{|}");
    expect(sketch(apply(rowOf(""), insert("group")))).toBe("\\left(|\\right)");
  });

  it("takes the preceding term for a power, exactly as the ^ key does", () => {
    expect(sketch(apply(rowOf("10", top(0, 2)), insert("power")))).toBe("10^{|}");
  });

  it("deletes the selection and inserts an empty formula, rather than wrapping it", () => {
    expect(sketch(apply(rowSelecting("123", top(0, 0), top(0, 3)), insert("sqrt")))).toBe("\\sqrt{|}");
  });

  it("inserts at the caret inside a slot", () => {
    expect(sketch(apply(rowOf("\\sqrt{12}", inside(1, "content", 0, 1)), insert("frac")))).toBe("\\sqrt{1\\frac{2|}{}}");
  });
});

describe("wrapping the term in front of the caret", () => {
  const insert = (kind: CompoundKind): Action => ({ type: "insertCompound", kind });

  it("wraps what follows in brackets, with the caret left inside them", () => {
    expect(sketch(apply(rowOf("1+10", top(0, 2)), insert("group")))).toBe("1+\\left(10|\\right)");
  });

  it("wraps for a root and a fraction as well", () => {
    expect(sketch(apply(rowOf("1+10", top(0, 2)), insert("sqrt")))).toBe("1+\\sqrt{10|}");
    expect(sketch(apply(rowOf("1+10", top(0, 2)), insert("cubeRoot")))).toBe("1+\\sqrt[3]{10|}");
    expect(sketch(apply(rowOf("1+10", top(0, 2)), insert("frac")))).toBe("1+\\frac{10|}{}");
  });

  it("wraps the whole formula in front of the caret, not a part of it", () => {
    expect(sketch(apply(rowOf("\\frac{1}{2}", top(0)), insert("group")))).toBe("\\left(\\frac{1}{2}|\\right)");
  });

  it("takes a term on each side: the one behind for the numerator, the one in front for the denominator", () => {
    expect(sketch(apply(rowOf("105", top(0, 2)), { type: "divide" }))).toBe("\\frac{10}{5|}");
    expect(sketch(apply(rowOf("x2", top(0, 1)), { type: "script", kind: "power" }))).toBe("x^{2|}");
  });

  it("leaves an empty formula where nothing is written in front of the caret", () => {
    expect(sketch(apply(rowOf("1+", top(0, 2)), insert("group")))).toBe("1+\\left(|\\right)");
    // An operator is not a term, so a formula opened in front of one stays empty.
    expect(sketch(apply(rowOf("1+10", top(0, 1)), insert("group")))).toBe("1\\left(|\\right)+10");
  });

  it("stops at the end of the term, leaving the rest of the row alone", () => {
    expect(sketch(apply(rowOf("10+20", top(0, 0)), insert("sqrt")))).toBe("\\sqrt{10|}+20");
  });
});

describe("the = key", () => {
  it("steps out of the innermost formula, not the outermost", () => {
    // Caret inside the root, which is itself inside the fraction's numerator.
    const state = rowOf("\\frac{\\sqrt{2}}{}", at([{ index: 1, branch: "numerator" }, { index: 1, branch: "content" }, { index: 0 }], 1));
    expect(sketch(apply(state, { type: "equals" }))).toBe("\\frac{\\sqrt{2}=|}{}");
  });

  it("types normally when the caret is not inside a formula", () => {
    expect(sketch(apply(rowOf("1", top(0, 1)), { type: "equals" }))).toBe("1=|");
  });

  it("leaves a power rather than writing an exponent of =", () => {
    expect(sketch(apply(rowOf("10^{2}", inside(1, "exponent", 0, 1)), { type: "equals" }))).toBe("10^{2}=|");
  });
});

describe("backspace", () => {
  it("deletes one character", () => {
    expect(sketch(apply(rowOf("12", top(0, 2)), del()))).toBe("1|");
  });

  it("deletes a surrogate pair as one character", () => {
    expect(sketch(apply(rowOf("a🙂", top(0, 3)), del()))).toBe("a|");
  });

  it("deletes the whole formula behind the caret, however full it is", () => {
    expect(sketch(apply(rowOf("\\sqrt{999}+1", top(2, 0)), del()))).toBe("|+1");
    expect(sketch(apply(rowOf("1\\frac{2}{3}", top(2, 0)), del()))).toBe("1|");
  });

  it("removes an enclosing formula once every slot of it is empty", () => {
    expect(sketch(apply(rowOf("1\\frac{}{}", inside(1, "numerator", 0)), del()))).toBe("1|");
  });

  it("removes one thing per keypress, never a cascade", () => {
    const emptied = apply(rowOf("\\frac{\\sqrt{}}{}", { path: [{ index: 1, branch: "numerator" }, { index: 1, branch: "content" }, { index: 0 }], offset: 0 }), del());
    expect(sketch(emptied)).toBe("\\frac{|}{}");
    expect(sketch(apply(emptied, del()))).toBe("|");
  });

  it("steps out of a slot that still has a sibling holding content", () => {
    const state = apply(rowOf("\\frac{}{2}", inside(1, "numerator", 0)), del());
    expect(sketch(state)).toBe("|\\frac{}{2}");
    expect(latexOf(state)).toBe("\\frac{}{2}");
  });

  it("steps back into the numerator from the start of the denominator", () => {
    expect(sketch(apply(rowOf("\\frac{1}{2}", inside(1, "denominator", 0)), del()))).toBe("\\frac{1|}{2}");
  });

  it("does nothing at the very start of the row", () => {
    const state = rowOf("12");
    expect(reduce(state, del())).toBe(state);
  });

  it("deletes a selection instead of a character", () => {
    expect(sketch(apply(rowSelecting("123", top(0, 1), top(0, 3)), del()))).toBe("1|");
  });
});

describe("delete forward", () => {
  it("deletes the character after the caret", () => {
    expect(sketch(apply(rowOf("12", top(0, 0)), del("forward")))).toBe("|2");
  });

  it("deletes the whole formula in front of the caret", () => {
    expect(sketch(apply(rowOf("1\\sqrt{999}", top(0, 1)), del("forward")))).toBe("1|");
  });

  it("removes an enclosing empty formula", () => {
    expect(sketch(apply(rowOf("1\\frac{}{}", inside(1, "denominator", 0)), del("forward")))).toBe("1|");
  });

  it("steps forward out of a slot whose siblings still hold content", () => {
    expect(sketch(apply(rowOf("\\frac{1}{}", inside(1, "denominator", 0)), del("forward")))).toBe("\\frac{1}{}|");
  });

  it("steps from the numerator into the denominator", () => {
    expect(sketch(apply(rowOf("\\frac{1}{2}", inside(1, "numerator", 0, 1)), del("forward")))).toBe("\\frac{1}{|2}");
  });

  it("does nothing at the very end of the row", () => {
    const state = rowOf("12", top(0, 2));
    expect(reduce(state, del("forward"))).toBe(state);
  });
});

describe("deleting a selection that spans structure", () => {
  it("removes a formula the selection covers completely", () => {
    expect(sketch(apply(rowSelecting("1\\sqrt{9}2", top(0, 1), top(2, 1)), del()))).toBe("1|");
  });

  it("keeps a formula the selection only reaches into, trimming what it covers", () => {
    expect(sketch(apply(rowSelecting("1\\sqrt{99}2", top(0, 1), inside(1, "content", 0, 1)), del()))).toBe("1|\\sqrt{9}2");
  });

  it("trims both slots and keeps the fraction when a selection crosses it", () => {
    expect(sketch(apply(rowSelecting("\\frac{12}{34}", inside(1, "numerator", 0, 1), inside(1, "denominator", 0, 1)), del()))).toBe("\\frac{1|}{4}");
  });

  it("clears the rest of a slot when the selection leaves the formula", () => {
    expect(sketch(apply(rowSelecting("\\frac{12}{34}5", inside(1, "numerator", 0, 1), top(2, 1)), del()))).toBe("\\frac{1|}{}");
  });

  it("does not care which end the user dragged from", () => {
    const forwards = apply(rowSelecting("\\frac{12}{34}", inside(1, "numerator", 0, 1), inside(1, "denominator", 0, 1)), del());
    const backwards = apply(rowSelecting("\\frac{12}{34}", inside(1, "denominator", 0, 1), inside(1, "numerator", 0, 1)), del());
    expect(sketch(backwards)).toBe(sketch(forwards));
  });

  it("types over a selection that spans structure", () => {
    expect(sketch(apply(rowSelecting("1\\sqrt{9}2", top(0, 1), top(2, 1)), type("x")))).toBe("1x|");
  });
});

describe("arrow keys", () => {
  it("collapses a selection to the edge it moves towards", () => {
    const selected = rowSelecting("123", top(0, 1), top(0, 3));
    expect(sketch(apply(selected, { type: "move", direction: "backward" }))).toBe("1|23");
    expect(sketch(apply(selected, { type: "move", direction: "forward" }))).toBe("123|");
  });

  it("moves to the row edges", () => {
    expect(sketch(apply(rowOf("1+\\sqrt{2}"), { type: "moveToEdge", edge: "end" }))).toBe("1+\\sqrt{2}|");
    expect(sketch(apply(rowOf("1+\\sqrt{2}", top(2, 0)), { type: "moveToEdge", edge: "start" }))).toBe("|1+\\sqrt{2}");
  });
});

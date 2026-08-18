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

  /**
   * A term written straight against a formula is multiplying it, and the value now says so.
   *
   * `\\frac{1}{3}x` is a fraction times x to anybody reading it, and juxtaposition is how that
   * is written on paper — but the value leaves this field for something that is not a person,
   * and a marking script comparing two answers should not have to work out where one term
   * ended and the next began.
   */
  describe("a term written against a formula", () => {
    it("writes the multiplication sign nobody typed", () => {
      expect(sketch(apply(rowOf("\\frac{1}{3}", top(2)), type("x")))).toBe("\\frac{1}{3}\\cdot x|");
      expect(sketch(apply(rowOf("\\sqrt{2}", top(2)), type("1"), type("0")))).toBe("\\sqrt{2}\\cdot 10|");
      expect(sketch(apply(rowOf("x^{2}", top(2)), type("1"), type("0")))).toBe("x^{2}\\cdot 10|");
    });

    it("does it at any depth, because the junction is what it looks at", () => {
      expect(sketch(apply(rowOf("\\frac{\\sqrt{2}}{3}", inside(1, "numerator", 2)), type("x"))))
        .toBe("\\frac{\\sqrt{2}\\cdot x|}{3}");
    });

    it("leaves a sign, a relation and a bracket alone — they are already the operator", () => {
      expect(sketch(apply(rowOf("\\frac{1}{3}", top(2)), type("+"), type("x")))).toBe("\\frac{1}{3}+x|");
      expect(sketch(apply(rowOf("\\frac{1}{3}", top(2)), type("=")))).toBe("\\frac{1}{3}=|");
    });

    it("leaves punctuation alone, which is the reason it is not simply `a term`", () => {
      // `\\frac{1}{2}, \\frac{1}{3}` is a list of two fractions and `\\frac{1}{2}\\cdot ,` is nothing
      // at all. A full stop reads the same way — very often it is the end of a sentence.
      expect(sketch(apply(rowOf("\\frac{1}{2}", top(2)), type(","), type(" "))))
        .toBe("\\frac{1}{2},|");
      expect(sketch(apply(rowOf("\\frac{1}{2}", top(2)), type(".")))).toBe("\\frac{1}{2}.|");
    });

    it("only where the two actually touch", () => {
      // A space away from the formula is a term of its own, and the caret has to be at the very
      // start of the run for the formula to be its left-hand neighbour.
      expect(sketch(apply(rowOf("\\frac{1}{3}+2", top(2, 2)), type("x")))).toBe("\\frac{1}{3}+2x|");
    });

    it("writes nothing in front of a formula, where the reading is not settled", () => {
      // Two and a half is written `2\\frac{1}{2}`, and `2\\cdot\\frac{1}{2}` is not what that means.
      expect(sketch(apply(rowOf("2", top(0, 1)), { type: "insertCompound", kind: "frac" })))
        .toBe("2\\frac{|}{}");
    });

    it("is a rule about typing, so a stored value is read back exactly as it was written", () => {
      // Nothing is rewritten on the way in: an answer saved before this release loads as itself,
      // and `parse` stays the inverse of `serialize`.
      expect(latexOf(rowOf("\\frac{1}{3}x"))).toBe("\\frac{1}{3}x");
      expect(sketch(apply(rowOf(""), { type: "paste", text: "\\frac{1}{3}x" }))).toBe("\\frac{1}{3}x|");
    });
  });

  it("shows multiplication as a dot and ignores spaces", () => {
    expect(sketch(apply(rowOf(""), type("2"), type("*"), type(" "), type("3")))).toBe("2\\cdot 3|");
  });

  it("replaces the selection it is typed over", () => {
    expect(sketch(apply(rowSelecting("123", top(0, 1), top(0, 2)), type("9")))).toBe("19|3");
  });
});

describe("one sign typed after another", () => {
  it("writes the new sign over the old one", () => {
    expect(sketch(apply(rowOf("1+", top(0, 2)), type("-")))).toBe("1-|");
    expect(sketch(apply(rowOf("1-", top(0, 2)), type("*")))).toBe("1\\cdot |");
    expect(sketch(apply(rowOf("1\\cdot ", top(0, 2)), type(":")))).toBe("1:|");
  });

  it("corrects as many times as it takes, and never leaves two behind", () => {
    expect(sketch(apply(rowOf(""), type("1"), type("+"), type("-"), type(":"), type("2")))).toBe("1:2|");
  });

  it("leaves a sign that opens a row, a bracket or a slot alone", () => {
    expect(sketch(apply(rowOf(""), type("-")))).toBe("-|");
    expect(sketch(apply(rowOf("\\left(\\right)", inside(1, "content", 0)), type("-")))).toBe("\\left(-|\\right)");
    expect(sketch(apply(rowOf("\\sqrt{}", inside(1, "content", 0)), type("-")))).toBe("\\sqrt{-|}");
  });

  it("writes a sign after a digit, a bracket or a whole formula", () => {
    expect(sketch(apply(rowOf("1", top(0, 1)), type("-")))).toBe("1-|");
    expect(sketch(apply(rowOf("\\left(9\\right)", top(2, 0)), type("-")))).toBe("\\left(9\\right)-|");
    expect(sketch(apply(rowOf("\\sqrt{2}", top(2, 0)), type("+")))).toBe("\\sqrt{2}+|");
  });

  it("only replaces for a sign: a digit typed after one is written", () => {
    expect(sketch(apply(rowOf("1+", top(0, 2)), type("2")))).toBe("1+2|");
    expect(sketch(apply(rowOf("1+", top(0, 2)), type("-2")))).toBe("1+-2|");
  });

  it("works in the middle of a run, where the caret is", () => {
    expect(sketch(apply(rowOf("1+2", top(0, 2)), type(":")))).toBe("1:|2");
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

  it("makes a selection the numerator and waits in the denominator", () => {
    // This replaced the selection with an empty fraction until 0.5.0. Selecting what the
    // fraction is *of* and pressing `/` is the obvious way to write one, and it was the one
    // way that threw the selection away.
    expect(sketch(apply(rowSelecting("123", top(0, 0), top(0, 3)), { type: "divide" }))).toBe("\\frac{123}{|}");
    expect(sketch(apply(rowSelecting("1+23", top(0, 0), top(0, 2)), { type: "divide" }))).toBe("\\frac{1+}{|}23");
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
    expect(sketch(apply(rowOf(""), insert("power")))).toBe("|^{}");
    expect(sketch(apply(rowOf("1+", top(0, 2)), insert("power")))).toBe("1+|^{}");
  });

  it("writes a power opened with no base from the base onwards", () => {
    expect(sketch(apply(rowOf(""), insert("power"), type("10"), { type: "skip" }, type("2")))).toBe("10^{2|}");
  });

  it("takes the preceding term for a power, exactly as the ^ key does", () => {
    expect(sketch(apply(rowOf("10", top(0, 2)), insert("power")))).toBe("10^{|}");
    expect(sketch(apply(rowOf("\\sqrt{2}", top(2, 0)), insert("power")))).toBe("\\sqrt{2}^{|}");
  });

  it("writes a formula around the selection rather than over it", () => {
    // Also a deliberate change of meaning in 0.5.0: a tool used to delete what was selected.
    expect(sketch(apply(rowSelecting("123", top(0, 0), top(0, 3)), insert("sqrt")))).toBe("\\sqrt{123|}");
    // The caret goes to the first slot still waiting to be written, which for a root that
    // already holds its radicand is the end of the radicand and for a power is the exponent.
    expect(sketch(apply(rowSelecting("123", top(0, 0), top(0, 3)), insert("power")))).toBe("123^{|}");
    expect(sketch(apply(rowSelecting("123", top(0, 0), top(0, 3)), insert("frac")))).toBe("\\frac{123}{|}");
    expect(sketch(apply(rowSelecting("123", top(0, 0), top(0, 3)), insert("group")))).toBe("\\left(123|\\right)");
  });

  it("still replaces a selection it cannot write around", () => {
    // From inside a fraction to outside it there is no single thing to wrap — half a fraction
    // is not a term — so the selection is deleted and an empty formula inserted, which is what
    // every selection used to get. The root comes out empty, which is the point of the test.
    const across = rowSelecting("\\frac{1}{2}x", inside(1, "numerator", 0, 0), top(2, 1));
    expect(sketch(apply(across, insert("sqrt")))).toBe("\\frac{\\sqrt{|}}{}");
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

  it("makes the term in front of the power tool its base, never its exponent", () => {
    expect(sketch(apply(rowOf("1+10", top(0, 2)), insert("power")))).toBe("1+10|^{}");
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
  it("comes out of every formula it is typed in, however deep", () => {
    // Caret inside the root, which is itself inside the fraction's numerator.
    const state = rowOf("\\frac{\\sqrt{2}}{}", at([{ index: 1, branch: "numerator" }, { index: 1, branch: "content" }, { index: 0 }], 1));
    expect(sketch(apply(state, { type: "equals" }))).toBe("\\frac{\\sqrt{2}}{}=|");
  });

  it("comes out of a fraction nested in a fraction", () => {
    const state = rowOf("\\frac{1}{\\frac{1}{2}}", at([{ index: 1, branch: "denominator" }, { index: 1, branch: "denominator" }, { index: 0 }], 1));
    expect(sketch(apply(state, { type: "equals" }))).toBe("\\frac{1}{\\frac{1}{2}}=|");
  });

  it("writes it after the formula it was in, not at the end of the row", () => {
    expect(sketch(apply(rowOf("\\frac{1}{2}+3", inside(1, "denominator", 0, 1)), { type: "equals" }))).toBe("\\frac{1}{2}=|+3");
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

describe("the space bar", () => {
  const skip: Action = { type: "skip" };

  it("finishes the run it is pressed in instead of writing anything", () => {
    const state = apply(rowOf("1+2", top(0, 1)), skip);
    expect(sketch(state)).toBe("1+2|");
    expect(latexOf(state)).toBe("1+2");
  });

  it("leaves the root or the power the caret is in", () => {
    expect(sketch(apply(rowOf("\\sqrt{1}", inside(1, "content", 0, 1)), skip))).toBe("\\sqrt{1}|");
    expect(sketch(apply(rowOf("x^{2}", inside(1, "exponent", 0, 1)), skip))).toBe("x^{2}|");
  });

  it("goes from the numerator down to the denominator before leaving the fraction", () => {
    expect(sketch(apply(rowOf("\\frac{1}{2}", inside(1, "numerator", 0, 1)), skip))).toBe("\\frac{1}{2|}");
    expect(sketch(apply(rowOf("\\frac{1}{2}", inside(1, "numerator", 0, 1)), skip, skip))).toBe("\\frac{1}{2}|");
  });

  it("carries a fraction typed in one breath out to the row", () => {
    expect(sketch(apply(rowOf(""), type("1"), { type: "divide" }, type("2"), skip, type("+3")))).toBe("\\frac{1}{2}+3|");
  });

  it("collapses a selection to its far end, whichever way it was dragged", () => {
    expect(sketch(apply(rowSelecting("123", top(0, 1), top(0, 3)), skip))).toBe("123|");
    expect(sketch(apply(rowSelecting("123", top(0, 3), top(0, 1)), skip))).toBe("123|");
  });

  it("does nothing at the end of the row", () => {
    const state = rowOf("12", top(0, 2));
    expect(reduce(state, skip)).toBe(state);
  });
});

describe("pasting", () => {
  it("reads pasted LaTeX as the formula it describes", () => {
    const state = reduce(rowOf("x=", top(0, 2)), { type: "paste", text: "\\frac{1}{2}" });
    expect(sketch(state)).toBe("x=\\frac{1}{2}|");
    // A formula, not its source: the caret can be moved into it.
    expect(latexOf(state)).toBe("x=\\frac{1}{2}");
  });

  it("leaves the caret after what was pasted, with whatever followed it still ahead", () => {
    const state = reduce(rowOf("ab", top(0, 1)), { type: "paste", text: "\\sqrt{9}c" });
    expect(sketch(state)).toBe("a\\sqrt{9}c|b");
  });

  it("counts every compound, so the caret lands right however many were pasted", () => {
    const state = reduce(rowOf(""), { type: "paste", text: "\\frac{1}{2}+\\sqrt{3}+x^{2}" });
    expect(sketch(state)).toBe("\\frac{1}{2}+\\sqrt{3}+x^{2}|");
  });

  it("writes text with no structure in it literally, the way typing does", () => {
    // `/` is not LaTeX, whatever the `/` key does when pressed, so this is text.
    expect(sketch(reduce(rowOf(""), { type: "paste", text: "1/2+3" }))).toBe("1/2+3|");
    expect(sketch(reduce(rowOf(""), { type: "paste", text: "2x" }))).toBe("2x|");
  });

  it("replaces a selection rather than pasting beside it", () => {
    const state = reduce(rowSelecting("abc", top(0, 0), top(0, 3)), { type: "paste", text: "\\sqrt{9}" });
    expect(sketch(state)).toBe("\\sqrt{9}|");
  });

  it("keeps the row alternating whatever was pasted", () => {
    for (const pasted of ["\\frac{1}{2}", "x^{2}_", "\\left(9\\right)", "\\sqrt{", "}}{{", ""]) {
      expect(isNormalized(reduce(rowOf("ab", top(0, 1)), { type: "paste", text: pasted }).content), pasted).toBe(true);
    }
  });
});

describe("where an = goes", () => {
  const equals: Action = { type: "equals" };

  it("comes out of anything that cannot hold a relation", () => {
    // `\frac{x=1}{2}` is not a sentence, so the `=` leaves the fraction.
    expect(sketch(apply(rowOf("\\frac{x}{2}", inside(1, "numerator", 0, 1)), equals))).toBe("\\frac{x}{2}=|");
    expect(sketch(apply(rowOf("\\sqrt{9}", inside(1, "content", 0, 1)), equals))).toBe("\\sqrt{9}=|");
    expect(sketch(apply(rowOf("x^{2}", inside(1, "exponent", 0, 1)), equals))).toBe("x^{2}=|");
  });

  it("stays inside brackets, which can", () => {
    // `(x=1)` is a sentence. Until 0.5.0 this came out to the row and wrote `\left(x\right)=`.
    expect(sketch(apply(rowOf("\\left(x\\right)", inside(1, "content", 0, 1)), equals))).toBe("\\left(x=|\\right)");
  });

  it("stops at the innermost thing that can hold it, however deep", () => {
    const state = rowOf("\\frac{\\left(x\\right)}{2}", at([{ index: 1, branch: "numerator" }, { index: 1, branch: "content" }, { index: 0 }], 1));
    expect(sketch(apply(state, equals))).toBe("\\frac{\\left(x=|\\right)}{2}");
  });

  it("is written where it is typed when nothing encloses it", () => {
    expect(sketch(apply(rowOf("x", top(0, 1)), equals))).toBe("x=|");
  });
});

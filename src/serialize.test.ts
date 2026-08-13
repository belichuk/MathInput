import { describe, expect, it } from "vitest";
import { type CompoundNode, type FormulaNode, frac, group, isNormalized, normalize, power, sqrt, subscript, text } from "./model";
import { parseLatex } from "./parse";
import { serializeToLatex } from "./serialize";

describe("serializeToLatex", () => {
  it("writes each node in its LaTeX form", () => {
    expect(serializeToLatex([text(""), sqrt([text("9")]), text("")])).toBe("\\sqrt{9}");
    expect(serializeToLatex([text(""), sqrt([text("8")], [text("3")]), text("")])).toBe("\\sqrt[3]{8}");
    expect(serializeToLatex([text(""), frac([text("1")], [text("2")]), text("")])).toBe("\\frac{1}{2}");
    expect(serializeToLatex([text(""), power([text("10")], [text("2")]), text("")])).toBe("10^{2}");
    expect(serializeToLatex([text(""), subscript([text("x")], [text("i")]), text("")])).toBe("x_{i}");
    expect(serializeToLatex([text(""), group([text("9+16")]), text("")])).toBe("\\left(9+16\\right)");
  });

  it("emits the whole power, base included, as one piece", () => {
    expect(serializeToLatex(parseLatex("\\sqrt{9+16}+10^{2}-\\frac{1}{2}"))).toBe("\\sqrt{9+16}+10^{2}-\\frac{1}{2}");
  });

  it("writes the dot as \\cdot, always separated from what follows", () => {
    expect(serializeToLatex([text("2⋅3")])).toBe("2\\cdot 3");
    expect(serializeToLatex([text("2⋅x")])).toBe("2\\cdot x");
    // The next node's base would otherwise run into the command name.
    expect(serializeToLatex([text("2⋅"), subscript([text("x")], [text("i")]), text("")])).toBe("2\\cdot x_{i}");
  });

  it("keeps empty slots as empty groups", () => {
    expect(serializeToLatex([text(""), frac(), text("")])).toBe("\\frac{}{}");
    expect(serializeToLatex([text(""), group(), text("")])).toBe("\\left(\\right)");
  });
});

/** Deterministic corpus generator — a failure here reproduces exactly. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const SAFE_CHARACTERS = "0123456789xyab+-=.,⋅";
type Random = () => number;
const pick = <Item,>(random: Random, items: readonly Item[]): Item => items[Math.floor(random() * items.length)];

function randomText(random: Random): string {
  return Array.from({ length: Math.floor(random() * 4) }, () => pick(random, [...SAFE_CHARACTERS])).join("");
}

function randomCompound(random: Random, depth: number): CompoundNode {
  switch (pick(random, ["sqrt", "nthRoot", "frac", "power", "subscript", "group"] as const)) {
    case "sqrt": return sqrt(randomArray(random, depth));
    case "nthRoot": return sqrt(randomArray(random, depth), randomArray(random, depth));
    case "frac": return frac(randomArray(random, depth), randomArray(random, depth));
    case "power": return power(randomArray(random, depth), randomArray(random, depth));
    case "subscript": return subscript(randomArray(random, depth), randomArray(random, depth));
    case "group": return group(randomArray(random, depth));
  }
}

function randomArray(random: Random, depth: number): FormulaNode[] {
  const nodes: FormulaNode[] = [text(randomText(random))];
  const count = depth <= 0 ? 0 : Math.floor(random() * 3);
  for (let index = 0; index < count; index += 1) nodes.push(randomCompound(random, depth - 1), text(randomText(random)));
  return nodes;
}

describe("round trip", () => {
  const random = createRandom(20260813);
  const corpus = Array.from({ length: 400 }, () => normalize(randomArray(random, 3)));

  it("re-reads its own output as the same LaTeX", () => {
    for (const tree of corpus) {
      const latex = serializeToLatex(tree);
      expect(serializeToLatex(parseLatex(latex)), latex).toBe(latex);
    }
  });

  it("re-reads its own output as the same tree", () => {
    for (const tree of corpus) {
      const parsed = parseLatex(serializeToLatex(tree));
      expect(parseLatex(serializeToLatex(parsed)), serializeToLatex(tree)).toEqual(parsed);
    }
  });

  it("only ever produces alternating arrays", () => {
    for (const tree of corpus) expect(isNormalized(parseLatex(serializeToLatex(tree)))).toBe(true);
  });
});

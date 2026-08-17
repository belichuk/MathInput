import { describe, expect, it } from "vitest";
import { frac, group, isNormalized, normalize, power, sqrt, subscript, text } from "./model";
import { parseLatex } from "./parse";
import { serializeToLatex } from "./serialize";
// The generator moved to `testing.ts` when the registry made it worth sharing: it builds
// constructs from the table, so a new row joins this corpus without being named here.
import { createRandom, randomArray } from "./testing";

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

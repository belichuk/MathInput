import { describe, expect, it } from "vitest";
import {
  type FormulaNode,
  branchKeys, comparePaths, comparePositions, decodePath, encodePath, frac, group, isBlank, isNormalized, isShallowEmpty,
  nextBoundary, normalize, power, previousBoundary, resolve, resolveArray, sqrt, subscript, text, updateArray, withBranch,
} from "./model";

describe("branchesOf", () => {
  it("orders branches the way the caret walks them", () => {
    expect(branchKeys(frac())).toEqual(["numerator", "denominator"]);
    expect(branchKeys(power())).toEqual(["base", "exponent"]);
    expect(branchKeys(subscript())).toEqual(["base", "subscript"]);
    expect(branchKeys(group())).toEqual(["content"]);
    expect(branchKeys(text("x"))).toEqual([]);
  });

  it("exposes a root index only when the root has one", () => {
    expect(branchKeys(sqrt())).toEqual(["content"]);
    expect(branchKeys(sqrt([text("8")], [text("3")]))).toEqual(["index", "content"]);
  });
});

describe("normalize", () => {
  it("puts an empty text run on both ends of an empty array", () => {
    expect(normalize([])).toEqual([text("")]);
  });

  it("merges adjacent text runs", () => {
    expect(normalize([text("1"), text("2"), text("3")])).toEqual([text("123")]);
  });

  it("separates neighbouring compounds with an empty text run", () => {
    const normalized = normalize([sqrt(), frac()]);
    expect(normalized).toEqual([text(""), sqrt(), text(""), frac(), text("")]);
    expect(isNormalized(normalized)).toBe(true);
  });

  it("normalizes every branch, however deep", () => {
    const messy = frac([text("1"), text("2")], [sqrt([])]);
    expect(normalize([messy])).toEqual([text(""), frac([text("12")], [text(""), sqrt([text("")]), text("")]), text("")]);
  });

  it("keeps a root index distinct from an absent one", () => {
    expect(normalize([sqrt([], null)])[1]).toEqual(sqrt([text("")], null));
    expect(normalize([sqrt([], [])])[1]).toEqual(sqrt([text("")], [text("")]));
  });

  it("is idempotent", () => {
    const once = normalize([text("a"), frac([text("1")], []), text("b"), text("c"), sqrt()]);
    expect(normalize(once)).toEqual(once);
  });
});

describe("isNormalized", () => {
  it("rejects arrays that break alternation", () => {
    expect(isNormalized([])).toBe(false);
    expect(isNormalized([text("a"), text("b")])).toBe(false);
    expect(isNormalized([sqrt()])).toBe(false);
    expect(isNormalized([text(""), frac([text("1"), text("2")], [text("")]), text("")])).toBe(false);
  });

  it("accepts properly alternating arrays", () => {
    expect(isNormalized([text("")])).toBe(true);
    expect(isNormalized([text("a"), sqrt(), text("b")])).toBe(true);
  });
});

describe("emptiness", () => {
  it("treats a single empty text run as blank", () => {
    expect(isBlank([text("")])).toBe(true);
    expect(isBlank([text("x")])).toBe(false);
    expect(isBlank([text(""), sqrt(), text("")])).toBe(false);
  });

  it("is shallow: a slot holding an empty formula still counts as occupied", () => {
    expect(isShallowEmpty(frac())).toBe(true);
    expect(isShallowEmpty(frac([text(""), sqrt(), text("")], [text("")]))).toBe(false);
    expect(isShallowEmpty(sqrt([text("9")]))).toBe(false);
    expect(isShallowEmpty(text(""))).toBe(false);
  });
});

const tree: FormulaNode[] = normalize([text("a"), frac([text("12")], [text(""), sqrt([text("9")]), text("")]), text("b")]);
// [ "a", frac{ "12" / [ "", sqrt{ "9" }, "" ] }, "b" ]

describe("resolve", () => {
  it("finds a top-level text run", () => {
    expect(resolve(tree, [{ index: 0 }])).toEqual({ array: tree, index: 0 });
  });

  it("descends through branches", () => {
    const found = resolve(tree, [{ index: 1, branch: "denominator" }, { index: 1, branch: "content" }, { index: 0 }]);
    expect(found?.array[found.index]).toEqual(text("9"));
  });

  it("returns null for paths that do not exist", () => {
    expect(resolve(tree, [])).toBeNull();
    expect(resolve(tree, [{ index: 9 }])).toBeNull();
    expect(resolve(tree, [{ index: 0, branch: "numerator" }, { index: 0 }])).toBeNull();
    expect(resolve(tree, [{ index: 1, branch: "base" }, { index: 0 }])).toBeNull();
  });

  it("resolves the array named by a branch path", () => {
    expect(resolveArray(tree, [])).toBe(tree);
    expect(resolveArray(tree, [{ index: 1, branch: "numerator" }])).toEqual([text("12")]);
    expect(resolveArray(tree, [{ index: 1, branch: "exponent" }])).toBeNull();
  });
});

describe("updateArray", () => {
  it("replaces a nested array without touching its siblings", () => {
    const updated = updateArray(tree, [{ index: 1, branch: "numerator" }], () => [text("34")]);
    expect(resolveArray(updated, [{ index: 1, branch: "numerator" }])).toEqual([text("34")]);
    expect(updated[0]).toBe(tree[0]);
    expect(resolveArray(updated, [{ index: 1, branch: "denominator" }])).toBe(resolveArray(tree, [{ index: 1, branch: "denominator" }]));
    expect(tree[1]).toEqual(frac([text("12")], [text(""), sqrt([text("9")]), text("")]));
  });

  it("replaces the root array for an empty path", () => {
    expect(updateArray(tree, [], () => [text("z")])).toEqual([text("z")]);
  });

  it("leaves the tree alone when the path is broken", () => {
    expect(updateArray(tree, [{ index: 0, branch: "content" }], () => [text("z")])).toBe(tree);
  });
});

describe("withBranch", () => {
  it("returns a new node carrying the replacement branch", () => {
    const replaced = withBranch(frac([text("1")], [text("2")]), "denominator", [text("3")]);
    expect(replaced).toEqual(frac([text("1")], [text("3")]));
  });
});

describe("comparePaths", () => {
  const sign = (value: number) => Math.sign(value);

  it("orders by index at the same depth", () => {
    expect(sign(comparePaths(tree, [{ index: 0 }], [{ index: 2 }]))).toBe(-1);
    expect(sign(comparePaths(tree, [{ index: 2 }], [{ index: 0 }]))).toBe(1);
    expect(comparePaths(tree, [{ index: 2 }], [{ index: 2 }])).toBe(0);
  });

  it("orders sibling branches by their visual order, not their names", () => {
    const numerator = [{ index: 1, branch: "numerator" as const }, { index: 0 }];
    const denominator = [{ index: 1, branch: "denominator" as const }, { index: 0 }];
    expect(sign(comparePaths(tree, numerator, denominator))).toBe(-1);
    expect(sign(comparePaths(tree, denominator, numerator))).toBe(1);
  });

  it("orders a shallow position before a deeper one inside the same node", () => {
    expect(sign(comparePaths(tree, [{ index: 1 }], [{ index: 1, branch: "numerator" }, { index: 0 }]))).toBe(-1);
  });

  it("breaks ties on offset", () => {
    const path = [{ index: 0 }];
    expect(sign(comparePositions(tree, { path, offset: 0 }, { path, offset: 1 }))).toBe(-1);
    expect(comparePositions(tree, { path, offset: 1 }, { path, offset: 1 })).toBe(0);
  });
});

describe("path encoding", () => {
  it("round-trips through the data-path attribute format", () => {
    const path = [{ index: 1, branch: "denominator" as const }, { index: 3, branch: "content" as const }, { index: 2 }];
    expect(encodePath(path)).toBe("1.denominator/3.content/2");
    expect(decodePath(encodePath(path))).toEqual(path);
  });

  it("uses the empty string for the root array", () => {
    expect(encodePath([])).toBe("");
    expect(decodePath("")).toEqual([]);
  });
});

describe("code point boundaries", () => {
  it("steps over plain characters", () => {
    expect(previousBoundary("abc", 2)).toBe(1);
    expect(nextBoundary("abc", 1)).toBe(2);
  });

  it("never splits a surrogate pair", () => {
    const value = "a🙂b";
    expect(nextBoundary(value, 1)).toBe(3);
    expect(previousBoundary(value, 3)).toBe(1);
  });
});

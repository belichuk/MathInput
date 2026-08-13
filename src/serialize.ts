import { type FormulaNode } from "./model";

/**
 * `\times` always takes a trailing space: whatever follows may be a letter — including one
 * that lives in the next node entirely, such as the base of `x_{i}` — and `\timesx` is not
 * a command. Parsing drops the space again, so the value stays stable across round trips.
 */
const serializeText = (value: string): string => value.split("×").join("\\times ");

function serializeNode(node: FormulaNode): string {
  switch (node.type) {
    case "text": return serializeText(node.value);
    case "sqrt": return node.index === null ? `\\sqrt{${serializeToLatex(node.content)}}` : `\\sqrt[${serializeToLatex(node.index)}]{${serializeToLatex(node.content)}}`;
    case "frac": return `\\frac{${serializeToLatex(node.numerator)}}{${serializeToLatex(node.denominator)}}`;
    case "power": return `${serializeToLatex(node.base)}^{${serializeToLatex(node.exponent)}}`;
    case "subscript": return `${serializeToLatex(node.base)}_{${serializeToLatex(node.subscript)}}`;
    case "group": return `\\left(${serializeToLatex(node.content)}\\right)`;
  }
}

/** Renders a formula tree back to KaTeX-compatible source. */
export const serializeToLatex = (nodes: FormulaNode[]): string => nodes.map(serializeNode).join("");

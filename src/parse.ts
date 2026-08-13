import { type FormulaNode, type TextNode, frac, group, isText, normalize, power, sqrt, subscript, text } from "./model";

/** Formulas never carry whitespace, and `*` is always shown (and stored) as `×`. */
export const cleanFormulaText = (value: string): string => value.replace(/\s+/g, "").split("*").join("×");

/** What `/`, `^` and `_` treat as "the thing immediately before the caret". */
const TRAILING_TERM = /[A-Za-z0-9.,]+$/;

type Stop = "end" | "brace" | "bracket" | "paren";

/**
 * Collects nodes while keeping the alternation invariant, and can hand back the
 * preceding term so that `^`/`_` can adopt it as their base.
 */
function createBuilder() {
  const nodes: FormulaNode[] = [];
  let pending = "";
  const pushText = (value: string) => { pending += value; };
  const push = (node: FormulaNode) => {
    if (isText(node)) { pending += node.value; return; }
    nodes.push(text(pending), node);
    pending = "";
  };
  return {
    push,
    pushText,
    pushAll: (values: FormulaNode[]) => values.forEach(push),
    /** Pops the trailing run of term characters, or the whole compound node sitting behind the caret. */
    takeTerm: (): FormulaNode[] => {
      const match = TRAILING_TERM.exec(pending)?.[0];
      if (match) {
        pending = pending.slice(0, pending.length - match.length);
        return [text(match)];
      }
      if (pending === "" && nodes.length > 0) {
        const node = nodes.pop()!;
        pending = (nodes.pop() as TextNode | undefined)?.value ?? "";
        return normalize([node]);
      }
      return [text()];
    },
    finish: (): FormulaNode[] => [...nodes, text(pending)],
  };
}

/**
 * Reads one line of LaTeX into a formula tree.
 *
 * Malformed input is tolerated rather than rejected, matching the original renderer:
 * a command with no group falls back to its own literal text, and a group left unclosed
 * at end of input is treated as if it had been closed.
 */
export function parseLatex(line: string): FormulaNode[] {
  let position = 0;

  function atStop(stop: Stop): boolean {
    if (position >= line.length) return true;
    if (stop === "brace") return line[position] === "}";
    if (stop === "bracket") return line[position] === "]";
    if (stop === "paren") return line[position] === ")" || line.startsWith("\\right)", position);
    return false;
  }

  function parseDelimited(open: string, close: string, stop: Stop): FormulaNode[] | null {
    if (line[position] !== open) return null;
    position += 1;
    const nodes = parseSequence(stop);
    if (line[position] === close) position += 1;
    return nodes;
  }

  /** `x^2` is as valid as `x^{2}`, so a single following character counts as a group. */
  function parseSingleToken(): FormulaNode[] | null {
    const character = line[position];
    if (character === undefined || "{}[]()\\^_".includes(character)) return null;
    position += 1;
    return [text(cleanFormulaText(character))];
  }

  function parseSequence(stop: Stop): FormulaNode[] {
    const builder = createBuilder();
    while (!atStop(stop)) {
      if (line.startsWith("\\sqrt", position)) {
        const start = position;
        position += "\\sqrt".length;
        const index = parseDelimited("[", "]", "bracket");
        const content = parseDelimited("{", "}", "brace");
        if (content === null) builder.pushText(line.slice(start, position));
        else builder.push(sqrt(content, index));
        continue;
      }
      if (line.startsWith("\\frac", position)) {
        position += "\\frac".length;
        const numerator = parseDelimited("{", "}", "brace");
        const denominator = numerator === null ? null : parseDelimited("{", "}", "brace");
        if (numerator !== null && denominator !== null) builder.push(frac(numerator, denominator));
        else if (numerator !== null) { builder.pushText("\\frac{"); builder.pushAll(numerator); builder.pushText("}"); }
        else builder.pushText("\\frac");
        continue;
      }
      if (line.startsWith("\\times", position)) {
        builder.pushText("×");
        position += "\\times".length;
        continue;
      }
      if (line[position] === "(" || line.startsWith("\\left(", position)) {
        position += line[position] === "(" ? 1 : "\\left(".length;
        const content = parseSequence("paren");
        if (line.startsWith("\\right)", position)) position += "\\right)".length;
        else if (line[position] === ")") position += 1;
        builder.push(group(content));
        continue;
      }
      if (line[position] === "^" || line[position] === "_") {
        const raised = line[position] === "^";
        position += 1;
        const script = parseDelimited("{", "}", "brace") ?? parseSingleToken();
        if (script === null) { builder.pushText(raised ? "^" : "_"); continue; }
        const base = builder.takeTerm();
        builder.push(raised ? power(base, script) : subscript(base, script));
        continue;
      }
      builder.pushText(cleanFormulaText(line[position]));
      position += 1;
    }
    return builder.finish();
  }

  return parseSequence("end");
}

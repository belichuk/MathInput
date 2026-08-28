import { type FormulaNode, type TextNode, TIMES, TRAILING_TERM, frac, group, isText, normalize, opname, power, sqrt, subscript, text } from "./model";
import { type FenceShape, OPNAMES } from "./registry";

/** Text is kept literally, apart from the equivalent multiplication and minus glyphs. */
export const cleanFormulaText = (value: string): string => value.replace(/[*×·]/g, TIMES).replace(/−/g, "-");

export const LATEX_CHARACTERS = {
  "\\pi": "π", "\\theta": "θ", "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ",
  "\\epsilon": "ε", "\\lambda": "λ", "\\mu": "μ", "\\sigma": "σ", "\\phi": "φ", "\\omega": "ω",
  "\\le": "≤", "\\ge": "≥", "\\ne": "≠",
} as const;
const COMMAND_CHARACTERS = Object.entries(LATEX_CHARACTERS) as [keyof typeof LATEX_CHARACTERS, string][];
export const latexForCharacter = (character: string): string | undefined =>
  COMMAND_CHARACTERS.find(([, value]) => value === character)?.[0];

type Stop = "end" | "brace" | "bracket" | "paren" | "bar";

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
    if (stop === "bar") return line[position] === "|" || line.startsWith("\\right|", position) || line.startsWith("\\right\\|", position);
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
      // `\times` is read as well as `\cdot`, so a formula written elsewhere still opens;
      // it is shown, and written back, as the dot.
      const product = ["\\cdot", "\\times"].find((command) => line.startsWith(command, position));
      if (product) {
        builder.pushText(TIMES);
        position += product.length;
        // The serializer uses one space to terminate a command before a following letter.
        // It is syntax rather than authored content, so do not turn it into a second space.
        if (line[position] === " ") position += 1;
        continue;
      }
      const commandCharacter = COMMAND_CHARACTERS.find(([command]) =>
        line.startsWith(command, position) && !/[A-Za-z]/.test(line[position + command.length] ?? ""),
      );
      if (commandCharacter) {
        builder.pushText(commandCharacter[1]);
        position += commandCharacter[0].length;
        continue;
      }
      const opnameName = OPNAMES.find((name) => line.startsWith(`\\${name}`, position));
      if (opnameName) {
        builder.push(opname(opnameName));
        position += opnameName.length + 1;
        // A serializer-emitted separator is syntax; authored additional whitespace remains.
        if (line[position] === " ") position += 1;
        continue;
      }
      const fence: { shape: FenceShape; stop: Stop; open: string; closes: string[] } | null =
        line[position] === "(" ? { shape: "paren", stop: "paren", open: "(", closes: ["\\right)", ")"] }
          : line.startsWith("\\left(", position) ? { shape: "paren", stop: "paren", open: "\\left(", closes: ["\\right)", ")"] }
            : line[position] === "|" ? { shape: "bar", stop: "bar", open: "|", closes: ["\\right\\|", "\\right|", "|"] }
              : line.startsWith("\\left\\|", position) ? { shape: "bar", stop: "bar", open: "\\left\\|", closes: ["\\right\\|"] }
                : line.startsWith("\\left|", position) ? { shape: "bar", stop: "bar", open: "\\left|", closes: ["\\right|"] }
                  : null;
      if (fence) {
        position += fence.open.length;
        const content = parseSequence(fence.stop);
        const close = fence.closes.find((candidate) => line.startsWith(candidate, position));
        if (close) position += close.length;
        builder.push(group(content, fence.shape));
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

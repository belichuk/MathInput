import { type CSSProperties, StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import katex from "katex";
import "katex/dist/katex.min.css";
import { MathInput } from "../src";
import { parseLatex } from "../src/parse";
import { serializeToLatex } from "../src/serialize";
import "./katex-reference.css";

/**
 * The editor's typography, beside a reference setting of the same expression.
 *
 * Every proportion in this component was chosen by eye against nothing: a radical's stroke
 * weight, how far a superscript rides above its base, the gap either side of a plus. This
 * page puts the choice beside the setting the whole discipline agreed on — KaTeX's, which
 * is TeX's — so that tuning one is reading a difference rather than guessing at an absolute.
 *
 * KaTeX is a devDependency of the demo and nothing else. It is not imported anywhere under
 * `src/`, it is not a dependency or a peer dependency of the package, and the component
 * ships no font and no renderer of its own: the whole point of the comparison is that the
 * left-hand side is drawn with borders, SVG and the host's own maths font.
 *
 * Two ways to read it. Side by side is for proportions — is that bar too thin, is that
 * exponent too small. Overlaid superimposes the reference on the editor in red, which is
 * the only way to see a baseline that sits a pixel low or a fence that stretches too far.
 */

type Section = { title: string; note: string; formulas: string[] };

const CORPUS: Section[] = [
  {
    title: "Runs, signs and spacing",
    note: "Upright digits against italic variables, the space either side of a binary operator and a relation, and the minus sign — which is U+2212 here and a hyphen in the editor until the typography lands.",
    formulas: ["2+3", "x-1", "2\\cdot x+3\\cdot y", "12.5+0.75", "x=1", "a+b-c"],
  },
  {
    title: "Fractions",
    note: "Bar thickness and the gap above and below it. A fraction inside a fraction does not shrink in the editor while a script does follow the TeX ladder — the inconsistency to settle.",
    formulas: ["\\frac{1}{2}", "\\frac{x+1}{2}", "\\frac{a+b}{c-d}", "\\frac{\\frac{1}{2}}{3}", "\\frac{1}{1+\\frac{1}{1+\\frac{1}{2}}}"],
  },
  {
    title: "Roots",
    note: "One stroke shared by hook, vinculum and fraction bar; height taken from the tree rather than the page; and the index kerned into the radical's notch with room left for an empty one.",
    formulas: ["\\sqrt{2}", "\\sqrt{x+1}", "\\sqrt[3]{8}", "\\sqrt[n]{x}", "\\sqrt{\\frac{1}{2}}", "\\sqrt{\\sqrt{2}}", "\\sqrt[3]{\\frac{x}{y}}", "\\sqrt{\\frac{x^{2}+y^{2}}{2}}"],
  },
  {
    title: "Scripts",
    note: "How far a script rides above or below its base, and how much smaller it is set: the ladder is 1 → 0.72 → 0.55 and then held, with a floor no smaller than legible.",
    formulas: ["x^{2}", "x_{1}", "x^{2}+y^{2}", "2^{10}", "x^{n+1}", "a_{i}^{2}", "x^{y^{z}}", "x_{i+1}"],
  },
  {
    title: "Brackets",
    note: "A fence stretches to what it holds. The editor draws its own in SVG with a stroke that keeps its width as the box changes shape, so this is where a curve that flattens shows up.",
    formulas: ["\\left(1+2\\right)\\cdot 3", "\\left(\\frac{1}{2}\\right)", "\\left(x+1\\right)^{2}", "\\frac{1}{\\left(x+1\\right)}", "\\left(\\frac{\\frac{1}{2}}{3}\\right)"],
  },
  {
    title: "Whole expressions",
    note: "Everything at once, at the size a student writes at. A formula that reads well here is worth more than any single proportion measured on its own.",
    formulas: ["x=\\frac{-b+\\sqrt{b^{2}-4\\cdot a\\cdot c}}{2\\cdot a}", "A=\\frac{1}{2}\\cdot b\\cdot h", "c=\\sqrt{a^{2}+b^{2}}", "\\frac{x^{2}}{\\sqrt{x+1}}=2"],
  },
];

const MATH_FONTS = [
  { label: "Serif — the default", value: '"STIX Two Math", "Cambria Math", Cambria, Georgia, serif' },
  { label: "Sans", value: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { label: "Monospace", value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { label: "KaTeX's own", value: 'KaTeX_Main, "STIX Two Math", serif' },
];

const Reference = ({ latex }: { latex: string }) => {
  const html = useMemo(() => katex.renderToString(latex, { throwOnError: false, displayMode: false, output: "html" }), [latex]);
  return <span className="reference__katex" dangerouslySetInnerHTML={{ __html: html }} />;
};

/**
 * The editor with its chrome taken off — no border, no padding, no minimum height — so
 * what is left beside the reference is the formula and nothing around it. Read-only,
 * because this page is about how it is set rather than how it is written.
 */
const Setting = ({ latex }: { latex: string }) =>
  <MathInput defaultValue={latex} disabled aria-label={`Editor setting of ${latex}`} />;

function Row({ latex, overlaid }: { latex: string; overlaid: boolean }) {
  // `read ∘ write` should be the identity, so anything that comes back different is worth
  // seeing on the page that is already showing every construct.
  const roundTrip = useMemo(() => serializeToLatex(parseLatex(latex)), [latex]);

  return <div className="reference__row">
    <code className="reference__source">
      {latex}
      {roundTrip === latex ? null : <span className="reference__drift" title="The editor reads and writes this back differently">→ {roundTrip}</span>}
    </code>
    {overlaid
      ? <div className="reference__stack">
          <Setting latex={latex} />
          <div className="reference__overlay"><Reference latex={latex} /></div>
        </div>
      : <>
          <div className="reference__cell"><Setting latex={latex} /></div>
          <div className="reference__cell reference__cell--katex"><Reference latex={latex} /></div>
        </>}
  </div>;
}

function KatexReference() {
  const [fontSize, setFontSize] = useState(24);
  const [mathFont, setMathFont] = useState(MATH_FONTS[0].value);
  const [overlaid, setOverlaid] = useState(false);

  const style = {
    "--reference-font-size": `${fontSize}px`,
    "--math-input-field-font-size": `${fontSize}px`,
    "--math-input-math-font-family": mathFont,
  } as CSSProperties;

  const formulas = CORPUS.reduce((total, section) => total + section.formulas.length, 0);

  return <main className={`reference${overlaid ? " reference--overlaid" : ""}`} style={style}>
    <header className="reference__header">
      <p className="reference__eyebrow">Typography reference</p>
      <h1>The editor, beside KaTeX</h1>
      <p className="reference__lede">
        {formulas} expressions, each drawn by the component and then set by KaTeX from the very same LaTeX.
        Every <em>starting value</em> in the typography work is tuned against this page, formula by formula.
        KaTeX is here as a devDependency of the demo; it is not in the package and never will be.
      </p>
      <div className="reference__controls">
        <label className="reference__control">
          <span>Size</span>
          <input type="range" min={14} max={48} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />
          <output>{fontSize}px</output>
        </label>
        <label className="reference__control">
          <span>Maths font</span>
          <select value={mathFont} onChange={(event) => setMathFont(event.target.value)}>
            {MATH_FONTS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
          </select>
        </label>
        <label className="reference__control reference__control--switch">
          <input type="checkbox" checked={overlaid} onChange={(event) => setOverlaid(event.target.checked)} />
          <span>Overlay the reference in red</span>
        </label>
      </div>
    </header>

    {CORPUS.map((section) => <section className="reference__section" key={section.title}>
      <h2>{section.title}</h2>
      <p className="reference__note">{section.note}</p>
      <div className="reference__table">
        <div className="reference__row reference__row--head">
          <span>LaTeX</span>
          {overlaid ? <span>Editor, with KaTeX over it</span> : <><span>Editor</span><span>KaTeX</span></>}
        </div>
        {section.formulas.map((latex) => <Row key={latex} latex={latex} overlaid={overlaid} />)}
      </div>
    </section>)}
  </main>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KatexReference />
  </StrictMode>,
);

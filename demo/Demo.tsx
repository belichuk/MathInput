import { type CSSProperties, useEffect, useRef, useState } from "react";
import { MathInput } from "../src";

type FieldTheme = {
  radius: number;
  borderColor: string;
  accentColor: string;
  surface: string;
  ink: string;
  padding: number;
};

const defaultTheme: FieldTheme = {
  radius: 16,
  borderColor: "#647895",
  accentColor: "#4d6f9a",
  surface: "#ffffff",
  ink: "#263956",
  padding: 14,
};

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="demo-control demo-control--color">
    <span>{label}</span>
    <span className="demo-color-input">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
      <output>{value.toUpperCase()}</output>
    </span>
  </label>;
}

function RangeControl({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return <label className="demo-control">
    <span>{label}</span>
    <span className="demo-range-input">
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{value}{unit}</output>
    </span>
  </label>;
}

function ToggleControl({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="demo-control demo-control--toggle">
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

function formatKey(key: string) { return key === "ArrowRight" ? "Right" : key === " " ? "Space" : key; }

export function Demo() {
  const [latex, setLatex] = useState("");
  const [theme, setTheme] = useState(defaultTheme);
  const [autoHideToolbar, setAutoHideToolbar] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);
  const [keyboardLog, setKeyboardLog] = useState<string[]>([]);
  const canvas = useRef<HTMLElement | null>(null);
  const [rawCopied, setRawCopied] = useState(false);
  const [keysCopied, setKeysCopied] = useState(false);
  const setThemeValue = <Key extends keyof FieldTheme>(key: Key, value: FieldTheme[Key]) => setTheme((current) => ({ ...current, [key]: value }));

  // Captured above the editor, on the way down: MathInput stops every key it takes from
  // travelling any further, so a listener waiting for them to arrive would hear nothing.
  useEffect(() => {
    const log = (event: KeyboardEvent) => {
      if (canvas.current?.contains(event.target as Node)) setKeyboardLog((keys) => [...keys, event.key]);
    };
    document.addEventListener("keydown", log, true);
    return () => document.removeEventListener("keydown", log, true);
  }, []);

  const mathInputStyle = {
    "--math-input-radius": `${theme.radius}px`,
    "--math-input-border-color": theme.borderColor,
    "--math-input-accent-color": theme.accentColor,
    "--math-input-control-color": theme.accentColor,
    "--math-input-control-hover-color": theme.ink,
    "--math-input-surface": theme.surface,
    "--math-input-subtle-surface": `${theme.surface}f2`,
    "--math-input-color": theme.ink,
    "--math-input-field-padding": `${theme.padding}px`,
  } as CSSProperties;
  const componentCode = `import type { CSSProperties } from "react";
import { MathInput } from "@belichuk/math-input";
import "@belichuk/math-input/styles.css";

const fieldStyle = {
  "--math-input-radius": "${theme.radius}px",
  "--math-input-border-color": "${theme.borderColor}",
  "--math-input-accent-color": "${theme.accentColor}",
  "--math-input-control-color": "${theme.accentColor}",
  "--math-input-control-hover-color": "${theme.ink}",
  "--math-input-surface": "${theme.surface}",
  "--math-input-subtle-surface": "${theme.surface}f2",
  "--math-input-color": "${theme.ink}",
  "--math-input-field-padding": "${theme.padding}px",
} as CSSProperties;

export function AnswerField() {
  return <MathInput style={fieldStyle}${autoHideToolbar ? "" : " autoHideToolbar={false}"} />;
}`;
  const copyCode = async () => {
    await navigator.clipboard.writeText(componentCode);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1_600);
  };
  const copyText = async (text: string, setCopied: (copied: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  };

  return <main className="demo-shell">
    <header className="demo-header">
      <p className="demo-eyebrow">MathInput / style laboratory</p>
      <h1>A field that lets you type math.</h1>
    </header>

    <div className="demo-layout">
      <aside className="demo-customizer" aria-label="Field customization">
        <div className="demo-customizer-heading">
          <p>Field controls</p>
          <button type="button" onClick={() => { setTheme(defaultTheme); setAutoHideToolbar(true); }}>Reset</button>
        </div>
        <RangeControl label="Corner radius" value={theme.radius} min={0} max={32} unit="px" onChange={(value) => setThemeValue("radius", value)} />
        <RangeControl label="Field padding" value={theme.padding} min={8} max={24} unit="px" onChange={(value) => setThemeValue("padding", value)} />
        <ColorControl label="Border" value={theme.borderColor} onChange={(value) => setThemeValue("borderColor", value)} />
        <ColorControl label="Accent" value={theme.accentColor} onChange={(value) => setThemeValue("accentColor", value)} />
        <ColorControl label="Surface" value={theme.surface} onChange={(value) => setThemeValue("surface", value)} />
        <ColorControl label="Formula ink" value={theme.ink} onChange={(value) => setThemeValue("ink", value)} />
        <ToggleControl label="Auto-hide toolbar" checked={autoHideToolbar} onChange={setAutoHideToolbar} />
      </aside>

      <div className="demo-preview-column">
        <section className="demo-canvas" aria-label="Math editor" ref={canvas}>
          <MathInput value={latex} onChange={setLatex} placeholder="Type a formula" autoHideToolbar={autoHideToolbar} className="demo-math-input" style={mathInputStyle} />
          <p className="demo-hint">Press <kbd>Enter</kbd> or use the row action to expand · <kbd>←</kbd> <kbd>→</kbd> moves through a formula · <kbd>Space</kbd> steps past what is in front of the caret · click to its right or press <kbd>End</kbd> to continue after it · <kbd>Esc</kbd> leaves the field</p>
        </section>

        <section className="demo-code" aria-labelledby="component-code-title">
          <div className="demo-code-heading">
            <div>
              <p id="component-code-title">Make it your component</p>
              <span>Current settings, ready to paste.</span>
            </div>
            <button type="button" onClick={copyCode}>{codeCopied ? "Copied" : "Copy code"}</button>
          </div>
          <pre><code>{componentCode}</code></pre>
        </section>

        <section className="demo-panels">
          <div className="demo-panel" aria-label="Raw value">
            <div className="demo-panel-heading">
              <h2>Raw value</h2>
              <div className="demo-panel-actions">
                <span>KaTeX source</span>
                <button type="button" className="demo-panel-copy" onClick={() => void copyText(latex, setRawCopied)} disabled={!latex} aria-label="Copy raw value">{rawCopied ? "Copied" : "Copy"}</button>
              </div>
            </div>
            <pre className="demo-panel-code"><code>{latex || "The KaTeX value will appear as you type."}</code></pre>
          </div>

          <div className="demo-panel" aria-label="Keyboard log" aria-live="polite">
            <div className="demo-panel-heading">
              <h2>Keyboard log</h2>
              <div className="demo-panel-actions">
                <span>{keyboardLog.length} keys</span>
                <button type="button" className="demo-panel-copy" onClick={() => void copyText(keyboardLog.map(formatKey).join(" "), setKeysCopied)} disabled={keyboardLog.length === 0} aria-label="Copy keyboard log">{keysCopied ? "Copied" : "Copy"}</button>
              </div>
            </div>
            <div className="demo-panel-keys">
              {keyboardLog.length > 0 ? keyboardLog.map((key, index) => <kbd key={`${key}-${index}`}>{formatKey(key)}</kbd>) : <p>Keys pressed in this editor will appear here.</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>;
}

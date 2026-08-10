import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import "./MathInput.css";

export type MathInputProps = {
  /** A raw KaTeX-compatible string. Makes the component controlled when supplied. */
  value?: string;
  /** Initial raw KaTeX-compatible string for uncontrolled use. */
  defaultValue?: string;
  /** Called with the complete, raw KaTeX-compatible string after every edit. */
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

type Template = {
  latex: string;
  selectionStart: number;
  selectionEnd: number;
};

const fraction: Template = { latex: "\\frac{a}{b}", selectionStart: 6, selectionEnd: 7 };
const power: Template = { latex: "x^{n}", selectionStart: 3, selectionEnd: 4 };
const squareRoot: Template = { latex: "\\sqrt{x}", selectionStart: 6, selectionEnd: 7 };

/**
 * A dependency-free raw LaTex editor. It deliberately does not parse or render
 * the expression; the value emitted from this component is always plain text.
 */
export function MathInput({
  value,
  defaultValue = "",
  onChange,
  placeholder = "Enter a KaTeX expression",
  disabled = false,
  className = "",
  style,
  "aria-label": ariaLabel = "Math expression",
}: MathInputProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteId = useId();
  const isControlled = value !== undefined;
  const expression = isControlled ? value : uncontrolledValue;

  // Keep a pending selection through controlled re-renders as well as local ones.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const selection = pendingSelection.current;
    const input = inputRef.current;
    if (!selection || !input) return;

    pendingSelection.current = null;
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(selection.start, selection.end);
    });
  }, [expression]);

  const publish = (nextValue: string, selection?: { start: number; end: number }) => {
    if (selection) pendingSelection.current = selection;
    if (!isControlled) setUncontrolledValue(nextValue);
    onChange?.(nextValue);
  };

  const replaceSelection = (
    replacement: string,
    selectStart: number,
    selectEnd: number,
  ) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? expression.length;
    const nextValue = expression.slice(0, start) + replacement + expression.slice(end);
    publish(nextValue, {
      start: start + selectStart,
      end: start + selectEnd,
    });
  };

  const insertTemplate = (template: Template) => {
    replaceSelection(template.latex, template.selectionStart, template.selectionEnd);
    setIsPaletteOpen(false);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    publish(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const input = event.currentTarget;
    const start = input.selectionStart ?? expression.length;
    const end = input.selectionEnd ?? expression.length;
    const selected = expression.slice(start, end);

    if (event.key === "/") {
      event.preventDefault();
      const insertion = `\\frac{${selected}}{}`;
      // Select the numerator when the user converted existing text; otherwise
      // place the caret in its first argument ready for entry.
      const numeratorStart = "\\frac{".length;
      const numeratorEnd = numeratorStart + selected.length;
      replaceSelection(insertion, numeratorStart, numeratorEnd);
      return;
    }

    if (event.key === "^") {
      event.preventDefault();
      const insertion = selected ? `${selected}^{}` : "^{}";
      const cursor = insertion.length - 1;
      replaceSelection(insertion, cursor, cursor);
      return;
    }

    // Detect the final character of a normally typed `\\sqrt` sequence and
    // replace it before the browser inserts that final `t`.
    if (event.key === "t" && expression.slice(0, start).endsWith("\\sqr") && start === end) {
      event.preventDefault();
      const prefixStart = start - 4;
      const nextValue = expression.slice(0, prefixStart) + "\\sqrt{}" + expression.slice(end);
      publish(nextValue, { start: prefixStart + 6, end: prefixStart + 6 });
    }
  };

  return (
    <div className={`math-input ${className}`.trim()} style={style}>
      <div className="math-input__bar">
        <input
          ref={inputRef}
          value={expression}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={ariaLabel}
          className="math-input__field"
        />
        <button
          type="button"
          className="math-input__toggle"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsPaletteOpen((open) => !open)}
          disabled={disabled}
          aria-expanded={isPaletteOpen}
          aria-controls={paletteId}
          aria-label="Toggle math symbols"
        >
          <span>f</span>x
        </button>
      </div>

      {isPaletteOpen && (
        <div id={paletteId} className="math-input__palette" role="toolbar" aria-label="Math symbols">
          <button type="button" onClick={() => insertTemplate(fraction)} disabled={disabled} aria-label="Insert fraction">
            <code>\frac&#123;&#125;&#123;&#125;</code>
            <span>Fraction</span>
          </button>
          <button type="button" onClick={() => insertTemplate(power)} disabled={disabled} aria-label="Insert exponent">
            <code>x^&#123;n&#125;</code>
            <span>Power</span>
          </button>
          <button type="button" onClick={() => insertTemplate(squareRoot)} disabled={disabled} aria-label="Insert square root">
            <code>\sqrt&#123;&#125;</code>
            <span>Root</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default MathInput;

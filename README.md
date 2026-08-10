# MathInput

A zero-dependency React + TypeScript math-expression input. It stores and emits raw, KaTeX-compatible LaTeX; it does not render or validate the expression.

## Run the demo

```sh
npm install
npm run dev
```

```tsx
import { useState } from "react";
import { MathInput } from "./src";

export function Example() {
  const [latex, setLatex] = useState("\\frac{1}{2} + x^{2}");

  return <MathInput value={latex} onChange={setLatex} />;
}
```

- The `fx` button opens a three-action palette: fraction, exponent, and square root.
- Template buttons select their first editable placeholder so typing replaces it.
- `/` turns a selection into `\\frac{selection}{}`; `^` turns it into `selection^{}`.
- Typing `\sqrt` creates `\sqrt{}` with the caret inside its braces.

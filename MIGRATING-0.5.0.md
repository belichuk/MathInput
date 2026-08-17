# Migrating to 0.5.0

Two things were renamed. Both old names still work in 0.5.0 and 0.6.x, and both go in 0.7.0 — so nothing here has to be done on upgrade day. Upgrade, then migrate when it suits.

Everything else in 0.5.0 is additive or a change in behaviour rather than in API; the behaviour changes are listed in [CHANGELOG.md](CHANGELOG.md), and one of them will reach your stored values, so read that too.

## Three toolbar props became one

```diff
- <MathInput autoHideToolbar={false} showOperators={false} />
+ <MathInput toolbar={{ autoHide: false, operators: false }} />
```

| Was | Write |
| --- | --- |
| `autoHideToolbar={x}` | `toolbar={{ autoHide: x }}` |
| `showOperators={x}` | `toolbar={{ operators: x }}` |
| `showNavigation={x}` | `toolbar={{ navigation: x }}` |

The values mean exactly what they meant. What the new shape adds is `constructs`, which turns off the `√ ∛ ½ xⁿ ( )` group — there was no room for a fourth switch when each was a prop of its own — and `toolbar={false}`, which is the strip gone entirely.

Mixing the two spellings is defined rather than merely tolerated: the old prop is read only where the new one is silent, so `toolbar={{ autoHide: false }} showOperators={false}` does what it looks like. Where both speak about the same group, the new one answers.

Each old prop warns once — once per prop, per page, not per render — naming what to write instead. In a build where `process.env.NODE_ENV` is `"production"` it says nothing.

### The codemod

No dependencies, and nothing to install. Save it as `codemod.mjs` — it is [`scripts/codemod-0.5.0.mjs`](scripts/codemod-0.5.0.mjs) in this repository, if you would rather take it from there:

```js
import { readFileSync, writeFileSync } from "node:fs";

const RENAMED = { autoHideToolbar: "autoHide", showOperators: "operators", showNavigation: "navigation" };
/** `name`, `name={true}`, `name={false}` — and nothing else, so an expression is left alone. */
const DEPRECATED = /\s+(autoHideToolbar|showOperators|showNavigation)(?:=\{(true|false)\})?(?=[\s/>])/g;

/**
 * The whole of one `<MathInput …>` opening tag, to the first `>` that is not inside a prop's
 * braces — because `onChange={(value) => save(value)}` has a `>` in it, and a match that
 * stopped there would splice the new prop into the middle of an arrow function.
 */
function tagAt(source, from) {
  let depth = 0;
  for (let at = from; at < source.length; at += 1) {
    const character = source[at];
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    else if (character === ">" && depth === 0) return source.slice(from, at + 1);
  }
  return null;
}

function rewrite(source) {
  let out = "";
  let at = 0;
  for (;;) {
    const start = source.indexOf("<MathInput", at);
    if (start === -1) break;
    // `<MathInputRow` is somebody else's component: stepped over, not stopped at.
    if (/[\w$]/.test(source[start + 10] ?? "")) {
      out += source.slice(at, start + 10);
      at = start + 10;
      continue;
    }
    const tag = tagAt(source, start);
    if (!tag) break;
    const options = [];
    const stripped = tag.replace(DEPRECATED, (_, name, value) => (options.push(`${RENAMED[name]}: ${value ?? true}`), ""));
    const rewritten = stripped.replace(/\s*(\/)?>$/, (_, slash) => ` toolbar={{ ${options.join(", ")} }}${slash ? " /" : ""}>`);
    out += source.slice(at, start) + (options.length === 0 ? tag : rewritten);
    at = start + tag.length;
  }
  return out + source.slice(at);
}

for (const file of process.argv.slice(2)) {
  const before = readFileSync(file, "utf8");
  const after = rewrite(before);
  if (after !== before) writeFileSync(file, after), console.log(`rewrote ${file}`);
}
```

```sh
node codemod.mjs src/**/*.tsx
git diff
```

It rewrites a tag only when it is sure what the tag says, and running it twice changes nothing the second time. It handles literal `true`/`false` and the bare `showOperators` shorthand, on `<MathInput>` tags written directly, however many lines they span. It does **not** handle a value that is an expression (`autoHideToolbar={pinned}`), a tag that already carries a `toolbar` prop, or your own wrapper component forwarding these props under its own name — it leaves those exactly as they are, and the runtime warning tells you where they are. It is a source rewrite rather than a parse, so read the diff.

## One CSS variable was renamed

```diff
- --math-input-control-hover-border: #9db2cc;
+ --math-input-control-hover-border-color: #9db2cc;
```

It sets a colour, and it was the only one of the eight colours here whose name did not say so. The stylesheet reads the new name first and falls back to the old one, so a theme that sets either gets what it asked for.

The rename is the visible half of writing the naming rule down: `--math-input-` and then what it applies to — nothing for the component as a whole, `field-` for the writing surface, `control-` for the buttons, `root-` for the radical. The [README's theming section](README.md#theming) has the rule and the three older names that predate it and are staying.

## What is not changing

`value`, `defaultValue`, `onChange`, `placeholder`, `disabled`, `className`, `style` and `aria-label` are untouched, as is the LaTeX the component emits and accepts. The class names in the stylesheet are unchanged, so a theme written against `.math-input__tool` or `.math-input__field` still applies.

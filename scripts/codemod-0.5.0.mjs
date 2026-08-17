import { readFileSync, writeFileSync } from "node:fs";

/**
 * `autoHideToolbar` / `showOperators` / `showNavigation` → one `toolbar` prop.
 *
 *   node scripts/codemod-0.5.0.mjs src/**\/*.tsx
 *
 * The same script is printed in MIGRATING-0.5.0.md, because a host has no reason to clone this
 * repository to get it. It is a source rewrite rather than a parse: a real codemod would want
 * a JSX parser, and a dependency of its own to supply one, for a rename of three props on one
 * component. What that costs is the caveats at the bottom of this file — so read the diff.
 */

const RENAMED = { autoHideToolbar: "autoHide", showOperators: "operators", showNavigation: "navigation" };
/** `name`, `name={true}`, `name={false}` — and nothing else, so an expression is left alone. */
const DEPRECATED = /\s+(autoHideToolbar|showOperators|showNavigation)(?:=\{(true|false)\})?(?=[\s/>])/g;

/**
 * The whole of one `<MathInput …>` opening tag, to the first `>` that is not inside a prop's
 * braces — because `onChange={(value) => save(value)}` has a `>` in it, and a match that stopped
 * there would splice the new prop into the middle of an arrow function.
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
    if (/[\w$]/.test(source[start + "<MathInput".length] ?? "")) {
      out += source.slice(at, start + "<MathInput".length);
      at = start + "<MathInput".length;
      continue;
    }
    const tag = tagAt(source, start);
    if (!tag) break;
    const options = [];
    const stripped = tag.replace(DEPRECATED, (_, name, value) => (options.push(`${RENAMED[name]}: ${value ?? true}`), ""));
    // The tag's own closing is put back as it was written: `/>` keeps the space before it that
    // stripping a prop would otherwise have eaten.
    const rewritten = stripped.replace(/\s*(\/)?>$/, (_, slash) => ` toolbar={{ ${options.join(", ")} }}${slash ? " /" : ""}>`);
    out += source.slice(at, start) + (options.length === 0 ? tag : rewritten);
    at = start + tag.length;
  }
  return out + source.slice(at);
}

export { rewrite };

if (process.argv[1]?.endsWith("codemod-0.5.0.mjs")) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("usage: node scripts/codemod-0.5.0.mjs <files…>");
    process.exit(1);
  }
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    const after = rewrite(before);
    if (after === before) continue;
    writeFileSync(file, after);
    console.log(`rewrote ${file}`);
  }
}

/*
 * What it does not do, all of which it leaves untouched rather than guesses at:
 *   • a value that is an expression — `autoHideToolbar={pinned}`
 *   • a tag that already carries a `toolbar` prop
 *   • your own wrapper component that forwards these props under its own name
 *   • a prop inside a string that happens to contain a brace
 * The deprecation warning is the backstop: whatever this misses still says so at runtime.
 */

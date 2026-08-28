# MathInput 0.6.0 — Release Notes

## Release assessment

**Not ready to tag or publish under the release prompt's definition of done.** The executable
production checks below pass, the published package is within its size budget, and the user
documentation describes the behaviour that has shipped. However, the release specification has five
unmet mandatory acceptance gates:

- **N3 is partial.** Split and boundary merge work, including Enter from a nested formula slot,
  but the shell still edits the row array directly. There is no document-level reducer, no
  defined/tested cross-row selection behaviour for typing or deletion, and no split/merge live
  announcement.
- **N1 test floor is partial.** The four atom-to-DOM bridge tests required by A-7 (mid-atom
  click, whole-atom double-click selection, drag from atom text, and composition in atom text)
  are not present.
- **N2 and N4 test floors are partial.** The named parse-tolerance tests for bare bars,
  mismatched fences, and an opname at the end of a row are absent. Token recognition also lacks
  the required history/caret-movement assertions and an IME commit that completes a token.
- **N5 is partial.** The README key/token table was refreshed manually; there is no generator
  that derives it from the registry and token targets as A-13 requires.

The items above are release blockers for a strict implementation of the release specification.
No tag or npm publish should be performed until they are resolved or the release owner explicitly
narrows the acceptance criteria.

## Baseline — release/0.6.0-datum

- Tests: 329 passing (`npm test`). The 341 and 333 counts in the earlier release materials are stale.
- ESM bundle: 14,546 B gzip; CSS: 2,290 B gzip (`npm run size`).
- Benchmark: one forced layout per keystroke in every fixture (`npm run bench`).
- ESM size gate: 16.25–16.55 KB gzip, rebased from the measured ESM baseline plus the 1.7–2.0 KB release allowance.

## Decisions

- Space remains ordinary text. `→` or `Tab` exits a construct before Enter splits at row level.
- No tag or npm publish is performed by this release branch; final human review of this report is required.

## Milestone log

| Milestone | Status | Test / size / bench delta | Notes |
| --- | --- | --- | --- |
| N0 | complete | suite green | Datum model and atom registry foundation |
| N1 | partial | suite green | Opnames and absolute value; A-7 bridge-test floor remains |
| N2 | partial | suite green | Greek letters and relations; A-12 tolerance-test floor remains |
| N3 | partial | suite green | Row split/merge mechanics, including Enter from a nested slot; document selection and announcements remain |
| N4 | partial | suite green | Token recognition and reversible history; required mobile/history tests remain |
| N5 | partial | 349 tests; 1 forced layout | Documentation and release artifacts; README generation remains |

## Final checks

- `npm test`: 349 passing.
- `npm run typecheck`: passing.
- `npm run build && npm run size`: ESM 16,294 B gzip (252 B below the rebased 16,546 B gate); CSS 2,311 B gzip.
- `npm run bench`: exactly one forced layout per keystroke in answer, worksheet, and nested fixtures.
- `npm pack --dry-run`: passing; 21 files, 210.3 kB compressed. It contains only the published build, type declarations, README, licence, package metadata, and changelog.
- `npm audit --omit=dev --audit-level=high`: 0 production vulnerabilities.
- Tagging and publishing: intentionally not performed.

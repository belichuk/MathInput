# MathInput 0.6.0 — Release Notes

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
| N1 | complete | suite green | Opnames and absolute value |
| N2 | complete | suite green | Greek letters and relations |
| N3 | complete | suite green | Row split/merge mechanics |
| N4 | complete | suite green | Token recognition and reversible history |
| N5 | complete | 345 tests; 1 forced layout | Documentation and release artifacts |

## Final checks

- `npm test`: 345 passing.
- `npm run typecheck`: passing.
- `npm run build && npm run size`: ESM 16,324 B gzip (222 B below the rebased 16,546 B gate); CSS 2,302 B gzip.
- `npm run bench`: exactly one forced layout per keystroke in answer, worksheet, and nested fixtures.
- Tagging and publishing: intentionally not performed.

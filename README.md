# Read Broken CSV Files Faster

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/rayarvan77/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/rayarvan77/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

An entry for [make.fun](https://make.fun)'s `csv-reader-speed-01-run-20261121`
bounty: a faster drop-in for make.fun's own csv-reader 1.0.0, answering
exactly as it does on every case.

## The idea

csv-reader 1.0.0 is written to be plain and easy to check, not fast: it
reads one character at a time and builds every field up a character at a
time. `solve.js` keeps its reading policy byte for byte — the BOM, the
empty lines, stray CRs, doubled quotes, quote junk, unterminated quotes,
short and long rows, and the exact error order — and changes only how the
text is walked:

- An unquoted field is found with one native scan for its next delimiter
  (comma, LF or CR) and taken with a single slice, instead of a
  per-character loop with a string concatenation per character.
- A quoted field jumps from quote to quote with `indexOf`, slicing the
  runs between them; `""` becomes one literal quote, and CR/LF inside a
  quoted field is converted only where the run actually holds one.
- The slow per-character work happens only where the policy needs it:
  stray CRs, and CR/LF inside a quoted field. Broken rows are rare in the
  drawn sets (about 1% short/long rows, 0.4% stray CRs), so the fast paths
  carry almost every field.

`main.ts` is the kit's driver, kept as the house baseline has it: it reads
every case from `/input/cases.json`, answers each one alone with `run()`
from `solve.js`, and writes `/output/answers.json`.

## Local check

Grade it on the kit's practice set, the way the server grades dev entries:

```bash
node cli/makefun.mjs grade-local --kit . --bot <repository> --driver process
```

Or run the driver and the sealed scorer by hand:

```bash
mkdir -p out
MAKEFUN_INPUT_DIR=../kit/practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
MAKEFUN_OUTPUT_DIR=out MAKEFUN_REFERENCE_DIR=../kit/practice/reference \
  node ../kit/program/scorer/main.ts
```

# Test Backfill

Finds the highest-risk under-tested code in a scope and backfills it with
tests that are actually proven to catch a real regression, not tests that
exist to move a coverage number.

The core idea: coverage percentage is a bad proxy for risk, and an
unverified test is a bad proxy for protection. This workflow ranks by
impact first, then proves every new test with a real mutation check before
calling it done.

## Pipeline

```
Scan (1 agent)
  -> per target, run independently (pipeline):
       Write (1 agent)
         -> Mutation-check (1 agent)
           -> Critique (1 agent) -- capped revise loop back to Write
```

If the scanner finds no genuine risk targets in scope, the workflow stops
immediately rather than inventing busywork.

Each target runs through its own write -> mutation-check -> critique loop
independently via `pipeline()`, so target 2 can be mid-write while target
1 is still revising - targets don't block each other the way a single
linear pass over the whole list would.

## Files

- `.claude/agents/*.md` - one subagent per role: `test-backfill-risk-scanner`,
  `test-backfill-writer`, `test-backfill-mutation-verifier`,
  `test-backfill-critic`. Distilled from `experts/qa-engineer.md`
  (test case design, boundary values, meaningful regression tests) and
  `experts/qa-architect.md` (risk-based testing/prioritization, quality
  metrics beyond raw coverage).
- `.claude/workflows/test-backfill.js` - the orchestration script: a
  single Scan stage, then a `pipeline()` over targets where each target
  independently runs Write -> Mutation-check -> Critique, with a capped
  revise loop back to Write when either the mutation check or the critic
  is not satisfied.
- `.claude/commands/test-backfill.md` - the `/test-backfill <scope>` entry
  point.

## Usage

```
/test-backfill src/billing
```

Or with no argument to scan the whole repo. The command runs the workflow
and reports, per target: the file, why it was flagged as risky, the tests
added, whether the mutation check proved they catch a real regression, and
the critic's final verdict - naming any target that still needs human
follow-up after the revise cap.

## Why rank by risk, not coverage percentage

A trivial getter with 0% coverage is not dangerous. A payment calculation
with a shallow happy-path test and 80% coverage can be very dangerous. The
`test-backfill-risk-scanner` agent is explicitly instructed to rank by
blast radius and complexity, not by which lines a coverage tool marks red,
which mirrors `qa-architect`'s "meaningful quality metrics, not just
coverage %" principle.

## Why a mutation check instead of just "write a test and run it"

A test that passes on the current, correct code proves nothing about
whether it would catch a bug - it could pass for reasons unrelated to the
behavior it claims to check. The `test-backfill-mutation-verifier` agent
temporarily reintroduces a targeted defect, confirms the new test actually
fails, then restores the original code. This is the same discipline
`bug-hunter`'s `bug-hunter-regression-tester` applies to a single known
bug, generalized here to tests written from scratch with no known bug to
reproduce.

## Why a separate critic on top of the mutation check

A test can be mutation-proven (it does fail against some defect) and still
be low quality: redundant, scoped to the wrong risk, or asserting something
no caller actually depends on. The `test-backfill-critic` agent applies a
QA architect's judgement on top of the mechanical mutation proof, and
either signal failing (mutation verdict not `proven`, or critique
`needs_revision`) sends the target back to the writer, capped at 2 rounds
so a genuinely hard target doesn't loop forever - the same
`needs_revision if any lens flags it` rule used by `prd-generator`'s
critique loop and `code-review`'s adversarial verify.

## Smoke test

Status: PASS.

Setup: planted a trivial, self-contained target at
`test-backfill/.smoke-scratch/calc.js` (an `average(nums)` function with
no existing tests) and ran the workflow scoped to
`test-backfill/.smoke-scratch`, via a headless `claude -p` session with
cwd set to `test-backfill/` (custom subagents in a nested
`.claude/agents/` only resolve when the session's cwd is inside that
workflow's own directory).

Result: Scan found 1 target (`average()` in `calc.js`, zero existing
coverage). The writer added `.smoke-scratch/calc.test.js` with 6 real
cases (non-array/empty-array input errors, single-element array,
positive/negative/mixed integers, floating-point sums) using Node's
built-in `node:test` runner. The mutation-verifier injected a real defect,
confirmed the new tests failed, then restored the original code -
verdict `proven`. The critic's verdict was `ready`, no revision needed.
Re-ran the test file directly after the smoke test (`node --test`): 6/6
passing. All schemas validated end-to-end (Scan -> Write ->
Mutation-check -> Critique).

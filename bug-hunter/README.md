# Bug Hunter

Takes a raw bug report to a verified fix: reproduce the bug end-to-end as a
real user would hit it, fan out independent root-cause hypotheses, converge
on the one true cause with evidence, fix it, prove a regression test
actually catches it, then independently re-verify the whole thing.

The core idea: never trust a fix that "should" work. Every stage that
matters is either run for real (Bash) or independently re-checked by a
different agent than the one that produced the claim.

## Pipeline

```
Reproduce (1 agent)
  -> Hypothesize (4 agents in parallel: data-flow, state-timing, boundary-input, integration-dependency)
    -> Converge (1 agent)
      -> Fix (1 agent)
        -> Regression Test (1 agent, with a mutation check)
          -> Verify (1 agent, independent re-run)
```

If the reproducer cannot actually observe the failure, the workflow stops
immediately after Reproduce rather than inventing a root cause for a bug
nobody confirmed exists.

## Files

- `.claude/agents/*.md` - one subagent per role: `bug-hunter-reproducer`,
  `bug-hunter-hypothesizer` (used four times, once per lens),
  `bug-hunter-converger`, `bug-hunter-fixer`,
  `bug-hunter-regression-tester`, `bug-hunter-verifier`. Distilled from
  `experts/software-developer.md` (root-cause tracing, debugging
  discipline) and `experts/qa-engineer.md` (test case design, meaningful
  regression tests over coverage theater).
- `.claude/workflows/bug-hunter.js` - the orchestration script: sequential
  Reproduce, parallel Hypothesize, sequential Converge -> Fix -> Regression
  Test -> Verify, with an early exit if reproduction fails and every stage
  schema-validated.
- `.claude/commands/bug-hunter.md` - the `/bug-hunter <bug report>` entry
  point.

## Usage

```
/bug-hunter Submitting the signup form with an email that has a trailing space silently creates an account with a broken email, no error shown
```

The command runs the workflow and reports back the confirmed root cause,
what was rejected and why, the fix, the regression test (proven via
mutation check), and the verifier's independent pass/fail.

## Why parallel hypotheses instead of one investigator

A single agent investigating root cause tends to anchor on the first
plausible explanation it finds and stop looking. Four agents independently
tracing data-flow, state/timing, boundary-input, and
integration/dependency angles surface competing explanations that a lone
investigator would miss one of - and the converger has to explicitly reject
the losing ones with a reason, not just silently pick a favorite. This
mirrors `code-review`'s parallel-lens pattern, but for causes instead of
findings.

## Why reproduce-first and verify-last are both mandatory, non-negotiable stages

Every other stage operates on a claim. Reproduce turns the bug from a
report into an observed fact before any investigation starts - without it,
"root cause" analysis is just theorizing about a report that might not even
be real (wrong description, already fixed, environment-specific). Verify
closes the loop the same way: it is a different agent than the fixer or
tester, re-running the original repro and the new test from scratch,
because a fixer grading its own fix (or a tester grading its own test) is
exactly the failure mode this workflow exists to avoid.

## Why a mutation-checked regression test instead of just "add a test"

A regression test that was never confirmed to fail against the bug proves
nothing - it could pass for reasons unrelated to the fix. The
`bug-hunter-regression-tester` agent is explicitly required to reintroduce
the bug's condition, confirm the new test actually fails, then restore the
fix and confirm it passes. This is the same "prove it, don't assert it"
standard `feature-implementer`'s tester agent applies to feature tests.

## Smoke test

PASS. A trivial, self-contained bug was planted in `.smoke-scratch/calc.js`
(an `average()` function with a stray `+ 1` that made `average([1,2,3])`
return `3` instead of `2`), and a headless `claude -p` session scoped to
`bug-hunter/` ran `/bug-hunter` against it end to end via a real Workflow
tool call.

Observed result:

- **Reproduce**: confirmed the exact failure via the real `node -e`
  invocation specified in the bug report (`average([1,2,3])` printed `3`).
- **Hypothesize / Converge**: 4 parallel lenses ran; the data-flow lens
  correctly identified the root cause (`total / numbers.length + 1`
  evaluates as `(total / numbers.length) + 1` due to operator precedence),
  the others self-ruled-out, and the converger recorded why.
- **Fix**: removed the stray `+ 1` in `.smoke-scratch/calc.js`; no other
  file was touched.
- **Regression Test**: added `.smoke-scratch/calc.test.js` using plain Node
  `assert`, and mutation-checked it - confirmed the test fails against the
  original buggy code and passes against the fix.
- **Verify**: an independent re-run of the repro and the regression test,
  plus extra probe inputs ([10,20,30], [5], [-1,-2,-3], [1,2]) all produced
  correct results, confirming a general fix rather than a hardcoded patch.

Final verdict: **pass**, original repro fixed, regression test passed via
mutation check, no outstanding issues.

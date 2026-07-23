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

IN PROGRESS. A trivial, self-contained bug was planted in
`.smoke-scratch/calc.js` (an `average()` function with a stray `+ 1` that
makes `average([1,2,3])` return `3` instead of `2`), and a headless
`claude -p` session scoped to `bug-hunter/` was launched in the background
to run `/bug-hunter` against it end to end (reproduce via the real
`node -e` invocation, fix only `.smoke-scratch/calc.js`, add a
Node-assertion regression test into `.smoke-scratch/`). This section will
be replaced with the real, observed pass/fail result once that run
completes - never with a fabricated result, per this repo's "never fake
success" rule.

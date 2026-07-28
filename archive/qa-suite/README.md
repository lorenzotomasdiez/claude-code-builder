# QA Suite

Runs a full QA pass on a service or area of an app: a QA architect designs a risk-based, layered test strategy from the tests that already exist plus the documentation, a QA engineer writes the missing tests and actually runs the suite, a coverage critic checks that the delivered tests really cover the strategy, and a reporter writes up the findings.

## Usage

```
/qa-suite the auth API
```

The command runs the workflow and writes the report to `docs/qa-reports/<slug>-qa.md`.

## Pipeline

```
Scope (1 agent)
  -> Strategy (1 agent: qa-architect inventories existing tests + docs, builds the matrix and gaps)
    -> Implement (1 agent: qa-engineer writes the missing tests, runs the suite)
      -> Verify (1 agent: qa-coverage-critic checks coverage vs the matrix)
         └─ loops Implement -> Verify while gaps remain, capped at 2 rounds
        -> Report (1 agent: qa-reporter)
```

## How it maps to the request

- **Scope** normalizes the informal target ("the auth API") into concrete code paths, existing test files, relevant docs, and the project's real test runner and run command.
- **Strategy** is the qa-architect's call: it reads the tests that already exist - including any left by prior workflows like `test-backfill` or `feature-implementer` - so it never double-covers, checks the documentation for the behavior the code is supposed to have, and produces a layered test matrix (unit / integration / e2e / contract / performance) plus the concrete gaps.
- **Implement** hands those gaps to the qa-engineer, who writes the missing tests following the repo's own conventions and then runs the suite for real. If the architect found no gaps, the engineer just runs the existing suite and reports what it finds.
- **Verify** is the coverage guarantee: the qa-coverage-critic independently re-reads (and re-runs where it matters) to confirm the delivered tests genuinely cover what the architect proposed, and hands back any remaining gaps. The loop closes them over up to two rounds.
- **Report** synthesizes the strategy, what was covered vs newly written, the actual run results and any defects found, coverage against the matrix, and the remaining risk with a recommendation.

## Files

- `.claude/agents/*.md` - qa-scoper, qa-architect, qa-engineer, qa-coverage-critic, qa-reporter, each with a narrow job and an explicit "what you do not do" section. The architect and engineer are distilled from `experts/qa-architect.md` and `experts/qa-engineer.md`.
- `.claude/workflows/qa-suite.js` - the orchestration script: sequential Scope and Strategy, then a capped Implement -> Verify loop, then Report.
- `.claude/commands/qa-suite.md` - the `/qa-suite <target>` entry point, which writes the report to `docs/qa-reports/`.

## Why a coverage critic instead of trusting the engineer

"The engineer says the tests are written and green" is a claim, not proof. A separate coverage critic re-derives the evidence - reading what the tests actually assert and re-running the load-bearing ones - so a file that exists but tests nothing, or a happy-path-only test of a behavior whose failure modes matter, is caught as an open gap rather than counted as done. The loop then routes the remaining gaps back to the engineer until coverage genuinely matches the strategy or the round cap is hit.

## Why QA reports defects instead of fixing them

When a newly written test fails because the code under test is wrong, the engineer records it as a defect rather than weakening the test or patching the code. QA's job is to find and report, not to silently make the suite green - a fix belongs in a separate change (for example a `bug-hunter` run) that can be reviewed on its own.

## Smoke test

Wiring verified: `node --check` passes on the orchestration script, and every `agentType` referenced in the workflow resolves to an agent definition in `.claude/agents/`. A full end-to-end run should be done once against a real service with a working test runner; it was not run inline to avoid spending tokens on a live fan-out. Run `/qa-suite <a real area of this or another repo>` to exercise it end to end and record the result here.

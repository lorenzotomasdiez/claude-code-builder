# TDD Developer

Point it at one thing - a requirement ID, a test plan, or just the words "the navigation bar" - and it does a real red-green cycle: writes every test first with one agent per test in parallel, implements until they pass, has an independent agent rule on whatever still fails, and finally drives a real browser to screenshot proof that a person can actually use the feature.

It returns a text report and saves nothing except the screenshots.

## The tag is the input

Most workflows in this library need a document. This one takes whatever you have:

| You give it | What happens |
|---|---|
| `FR-3` | Finds the requirement and, if `/functional-test-plan` ran, its plan - and **keeps that plan's scenario IDs**. Someone already did the decomposition; redoing it produces a second one that disagrees with the first. |
| `docs/tests/checkout/fr-3.md` | Same, without the search. |
| `the navigation bar` | No spec exists. The framer derives the behavior from the codebase and plain meaning, and records every judgment call as an assumption. This is a first-class input, not a degraded one. |

On a bare-tag run, the assumptions in the report **are** the specification that got built. That is why the report puts them where you will read them.

## Pipeline

```
Frame (1 agent, opus - resolve the tag, learn how this repo runs tests, emit the test list)
  -> Red (N agents in parallel, haiku - one per test, each writes ONE failing test file)
    -> Verify red (1 agent, haiku - real exit codes; a PASS here is flagged as a hollow test)
      -> Green (1 agent, sonnet - implement until they pass)
        -> Verify (haiku) -> Adjudicate (1 agent per failure, sonnet) -> Fix (routed by ownership)
             └─ exactly one retry, then give up loudly
          -> Browser (opus writes one journey, haiku runner drives playwright-cli + screenshots)
            -> Report (sonnet, text only, saved nowhere)
```

## Model choices, and why each one

- **Frame is opus.** It is the only expensive thinking in the run. Everything downstream is fast and literal and does exactly what the test list says, so a vague list produces five vague tests in parallel and a worthless run.
- **Red is haiku.** Writing one test from a concrete Given/When/Then with the conventions handed to you is mechanical, and N of them run at once. Speed is the feature.
- **Green is sonnet.** Implementation is real judgment, and it is one agent, not N.
- **Adjudication and fixes are sonnet.** A correction needs more judgment than a first draft, which is why a test *rewrite* runs on sonnet even though the original was written by haiku.
- **The E2E journey is opus, the browser runner is haiku.** Deciding what would embarrass you if it broke is judgment; clicking through it and screenshotting is not.

## Why green is one agent when red is N

This is the design decision most likely to look inconsistent, so: the tests for one feature are independent by construction - each owns its own file, and the framer guarantees no two share a path (the script hard-fails if it ever does). The code that satisfies them is not independent. They all land on the same modules.

N agents editing the same source files concurrently is a corruption bug, not a speedup. So red fans out and green does not.

## Why an independent adjudicator

When a test still fails after an honest implementation attempt, someone has to decide which side is wrong - and it cannot be either of the agents involved. The test writer will defend the test, the implementer will defend the code, and each has already had its chance to change its own side.

So a third agent that wrote neither and fixes neither reads the requirement, the test, the code, and the real error, and returns one of `test_wrong`, `implementation_wrong`, `both_wrong`, or `environment`. The orchestrator routes the fix by **ownership**: test faults go back to the test writer, implementation faults to the implementer. The boundary holds even during repair.

Its tie-break rule is deliberately asymmetric: when the evidence is balanced, it must choose `implementation_wrong`. A wrongly blamed implementation costs one fix attempt. A wrongly blamed test gets the specification edited to match whatever the code already does, which is how a suite silently stops meaning anything.

## Why exactly one retry

Two attempts total, then the workflow stops and reports the test as unsolved with the adjudicator's reasoning attached.

An agent that cannot fix something in two tries with a specific fault report usually cannot fix it in five either, and the failure mode of an uncapped loop is not a failed run - it is a run that keeps mutating the codebase while getting no closer. Stopping leaves a clean diff and a specific question for a human.

## The boundary that makes green mean something

**The implementer may not edit any test file, for any reason, not even a typo.** If it thinks a test is wrong, it implements the test as written and flags it for adjudication.

The moment the agent trying to turn tests green is also allowed to edit them, green stops carrying information. The workflow surfaces a violation loudly: the implementer reports `testFilesTouched`, and anything in it is logged as a contract violation telling you the run's green is not trustworthy.

The same reasoning drives the separate verifier: no agent grades its own work. The implementer's `believedPassing` is explicitly not trusted; only the verifier's real exit code counts.

## The hollow-test check

After the red phase, before any implementation exists, a test that **passes** is flagged in `suspectHollow`.

It should be impossible - the code it tests does not exist yet - so a green result almost always means the test asserts nothing: a skipped test, a tautology, a swallowed error. This is the one defect no later phase can catch, because from the green phase onward a hollow test is indistinguishable from a passing one.

## How it differs from `feature-implementer`

Both do red-green TDD with a verified red and an independent verifier. They are not interchangeable.

| | `tdd-developer` | `feature-implementer` |
|---|---|---|
| Input | A tag - an FR id, a path, or a bare description | A full `/tdd-blueprint` document set |
| Works with no spec | Yes, deriving behavior and recording assumptions | No, it refuses and invents no criteria |
| Test writing | N agents in parallel, one per test, haiku | One agent per slice, in build order |
| Still failing? | Independent adjudicator rules test-vs-code, one retry | Fix loop, then three review lenses |
| Browser proof | Yes - screenshots are the deliverable | No |
| Output | Text report, nothing saved but screenshots | A PR-ready tree and a drafted PR |

Reach for this when you want one feature built and demonstrably working today. Reach for `feature-implementer` when you have a blueprint and want a reviewed, PR-ready branch.

## Files

- `.claude/agents/tdd-dev-framer.md` - opus. Resolves the tag, reads the repo to learn the real test command and conventions, runs the suite once to check it was green *before* this run, and emits the test list plus the implementation brief. Writes nothing.
- `.claude/agents/tdd-dev-test-writer.md` - haiku. Writes exactly one failing test file, and also does test-side fixes after adjudication (on sonnet). Carries the rule that a failing import is a success and the only real failure is not writing the file. No Bash, no production code.
- `.claude/agents/tdd-dev-verifier.md` - haiku. Runs the suite and reports real exit codes and real error text. Fixes nothing, diagnoses nothing.
- `.claude/agents/tdd-dev-implementer.md` - sonnet. The only agent that writes production code. Forbidden from touching any test file.
- `.claude/agents/tdd-dev-adjudicator.md` - sonnet, no write tools at all. Rules on one failure.
- `.claude/agents/tdd-dev-e2e-author.md` - opus. Writes one browser journey as executable English steps, never code, never softened to pass.
- `.claude/agents/tdd-dev-browser-runner.md` - haiku. Drives `playwright-cli`, screenshots every step, reports `blocked` honestly when the tooling is absent.
- `.claude/agents/tdd-dev-reporter.md` - sonnet, **no tools**. Writes the text report and cannot save it even by accident.
- `.claude/workflows/tdd-developer.js` - the orchestration script.
- `.claude/commands/tdd-developer.md` - the `/tdd-developer <tag>` entry point.

## Usage

```
/tdd-developer FR-3
/tdd-developer docs/tests/checkout/fr-3.md
/tdd-developer the navigation bar
```

Screenshots land in `docs/proof/<slug>/`. Everything else is source code in your repo, and the report is printed, not saved.

**This is the only workflow in this library that writes production code into your repo.** Run it on a clean git tree so `git diff` shows exactly what it did.

## What it will not do

- Install a dependency, or add anything to a package manifest. If the implementer believes one is required it stops and reports a blocker, because that decision has licensing and security consequences that belong to you.
- Choose or install a test framework for a project that has none.
- Edit test configuration or build configuration to make something pass.
- Change git state.
- Fake a browser run. No `playwright-cli`, or the app is not serving, means `blocked` - which is explicitly *not* evidence about the feature either way.

## Smoke test

**Status: not yet run.** The package is anatomy-clean (`node scripts/validate-workflow.mjs tdd-developer` exits 0), the script parses (`node --check`), and its schemas pass `schema-lint`. Nothing else is proven.

It could not be run in the session that built it: this repo snapshots the subagent registry at session start, so the eight agent definitions are not resolvable until a later session. The same constraint is recorded against `tech-blueprint` and `functional-test-plan` in `STATUS.md`.

There is a second, larger reason it was not run here: **this workflow writes production code**, and this repo is a library of workflow definitions with no application to build a navigation bar into. A meaningful smoke test needs a small throwaway project with a real test runner - not this repo. Running it here would either fail at framing (no test framework) or start writing source files into a documentation repo.

Whoever picks this up next:

1. Make a scratch project outside this repo with a real test setup - `npm create vite`, a bare pytest project, whatever is fastest.
2. Run `/tdd-developer a function that formats a price in cents as a currency string` there. That tag is deliberately spec-free, tiny, and has no UI, so it exercises the framing-from-nothing path and skips the browser phase.
3. Then run one with a UI to exercise the browser phase, and confirm the screenshots actually land.

Specific things to watch, because they are the most likely to be wrong:

- **Does the red phase actually stay red?** The haiku writers are told a failing import is a success. The most likely failure is one of them "helpfully" creating the production module so its own test resolves. If `suspectHollow` comes back non-empty on the first run, that is this bug.
- **Does the implementer respect the test boundary?** Check `testFilesTouched` is empty and confirm it with `git diff --stat` on the test files.
- **Does the adjudicator actually pick a side**, or does it hedge? A hedged verdict routes the fix nowhere and wastes the single retry.
- **Does the one-retry cap hold?** Give it a deliberately impossible test and confirm it stops after two attempts and reports it unsolved rather than looping.
- **Does the browser runner report `blocked` honestly** when `playwright-cli` is absent, rather than claiming a pass?

Record what was run, the phases, and pass or fail here. If it breaks, record the blocker and the evidence rather than editing this section to look clean.

# Feature Implementer

Takes a TDD blueprint all the way to a PR-ready working tree, by actually doing TDD: read the blueprint's behavior specs and red-green build order, then for each slice write the failing test first, confirm with a real exit code that it is genuinely red, implement until a real exit code says green, and review through three independent lenses before the slice counts as shipped.

It runs **downstream of `/tdd-blueprint`** and invents no acceptance criteria of its own.

Built to the same anatomy and quality bar as `prd-generator/` (the canonical template), covering BACKLOG.md item 2.

## Pipeline

```
Read blueprint (1 agent - normalizes behavior-specs.md + tdd-plan.md, preserving spec IDs)
  -> per slice, IN BUILD ORDER:
       RED:    write the failing test from the spec (1 agent, no Bash)
                 -> verify it actually fails (1 agent, reports the real exit code)
       GREEN:  implement until the tests pass (1 agent)
                 -> verify (real exit code), fix loop up to MAX_FIX_ROUNDS
       REVIEW: 3 independent lenses in parallel (spec / regression / quality)
                 -> if any lens flags it: revise, re-verify, re-review, up to MAX_REVIEW_ROUNDS
                 -> status = shipped only if exit code 0 AND all three lenses ready
                    otherwise BLOCKED, carrying the verifier's raw output
  -> Draft PR (1 agent - blocked work stated first, never buried)
```

## Why it consumes a TDD blueprint instead of a raw ticket

An earlier version took a ticket, invented its own acceptance criteria, and planned its own slices. Paired with `/tdd-blueprint` that produced two independent decompositions of the same work that did not agree, and threw away the blueprint's behavior specs - the very artifact a fan-out of spec authors and three adversarial critique lenses had just been spent producing. The traceability matrix pointed at spec IDs nothing downstream preserved.

So the requirement side is now owned entirely by `/tdd-blueprint`. This workflow has no agent that mints requirements: the closest thing, `feature-implementer-blueprint-reader`, is explicitly a transcriber, and an ambiguity it cannot resolve becomes a recorded gap rather than a guess. Spec IDs travel from `behavior-specs.md` into test names and into what the spec lens reviews against, so the blueprint's traceability survives contact with the code.

## Why the test comes before the implementation

Test-after-implementation is not TDD, and the difference is not ceremonial. A test written against code that already exists tends to assert what the code happens to do; a test written against a spec asserts what the code is supposed to do. Since the blueprint already contains Given/When/Then specs, writing the test first costs nothing extra and is the entire point of having produced them.

The workflow then does something a human TDD practitioner does implicitly and an agent will not: it **verifies the red**. After the test is written and before any implementation exists, the verifier runs it. If it fails, good. If it *passes*, that is recorded as a warning and passed to the spec lens, because a test that was green before the code existed is not testing the behavior it claims to. Nothing else in the pipeline can catch a hollow test, because a hollow test looks identical to a passing one at every later stage.

## Why an independent verifier instead of a self-reported result

The earlier version had one agent that wrote the tests, ran them, and reported `testResult: 'pass' | 'fail' | 'not_run'`. That is an agent grading its own work, and the failure mode is measured rather than theoretical: agents report success that did not occur (one documented case reported 45/45 tasks complete when 26/45 passed hidden tests).

So the roles are split. `feature-implementer-test-author` has no `Bash` tool and no result field - it cannot report an outcome even if it wanted to. `feature-implementer-verifier` runs the command and returns `{command, exitCode, ranAtAll, outputTail}` with deliberately **no `summary` and no `verdict` field**: there is nowhere to put an opinion. The orchestrator gates on `exitCode === 0 && ranAtAll`, never on prose.

`ranAtAll` exists for one specific lie: "this repo has no test runner" must never become "the tests passed". It is a distinct outcome that blocks the slice.

Measured before adopting this: across 9 trials against a deliberately trivial, tempting-to-fix failing test, a schema-constrained reporter relayed the true exit code 3/3 times it could run, reported `ranAtAll: false` rather than fabricating a pass 6/6 times it could not, and edited the source it was told not to touch 0/9 times.

## Why three review lenses instead of one self-reviewer

The earlier version used a single self-reviewer, which contradicted this repo's own rule in `CLAUDE.md`: never a single rubber-stamp reviewer where a panel of independent lenses would catch more. `prd-generator`, the canonical template, already runs three critique lenses for exactly this reason.

The three lenses here - spec conformance, regression risk, code quality - carve up what the single reviewer's checklist already contained, and each is explicitly told to stay out of the others' territory. That differentiation is load-bearing: a panel of near-identical reviewers buys one reviewer's blind spots N times over at N times the cost. Any single lens returning `needs_revision` holds the slice back, so no lens has to weigh its finding against another's.

## Why slices run in a sequential loop, not `parallel()`/`pipeline()`

Every other workflow in this repo (`prd-generator`'s critique lenses, `code-review`'s five review lenses) fans work out in parallel because each lens is independently applied to the *same* fixed input. Implementation slices are not independent: slice 2 is written against the working tree slice 1 already changed, and `tdd-plan.md`'s `dependsOn` field says so explicitly. Running slices in parallel would mean several agents editing the same working tree simultaneously with no idea what the others just wrote - a correctness hazard, not a speedup. So slices run one at a time in build order. The parallelism goes where the work genuinely is independent: the three review lenses.

## Why blocked slices are loud

The earlier version's revise loop exited after its round cap **regardless of verdict**. A slice that never reached `ready` was pushed into the results and flowed into the PR body with nothing logging it and nothing requiring the PR writer to mention it. The worst possible output of a ticket-to-PR workflow is a PR that reads as complete over broken work, because that is the one that gets merged.

Now: hitting either cap marks the slice `blocked` with a reason and the verifier's raw output; every blocked slice is logged as it happens; the PR writer is required to open with a `## Blocked - do not merge as complete` section quoting the raw failure; and if *every* slice is blocked the workflow throws, because that is a failed run and should look like one.

## Files

- `.claude/agents/feature-implementer-blueprint-reader.md` - transcribes `behavior-specs.md` + `tdd-plan.md` into structured specs and an ordered slice list, preserving every spec ID exactly. Invents nothing; unresolved ambiguity becomes a recorded gap.
- `.claude/agents/feature-implementer-test-author.md` - writes the failing test for one slice from its Given/When/Then specs, before any implementation exists, carrying spec IDs into test names. Has no `Bash`, by design. Distilled from `experts/qa-engineer.md`.
- `.claude/agents/feature-implementer-verifier.md` - runs one command, reports the real exit code and raw output verbatim. Forbidden to fix, retry, interpret, or soften. The workflow's only source of ground truth.
- `.claude/agents/feature-implementer-developer.md` - implements exactly one slice to turn its already-failing tests green. Explicitly forbidden to modify the tests to get there. Distilled from `experts/software-developer.md`.
- `.claude/agents/feature-implementer-lens-spec.md` - reviews spec conformance only: is every spec ID met, tested, and traceable. Distilled from `experts/qa-architect.md`.
- `.claude/agents/feature-implementer-lens-regression.md` - reviews regression risk only: what existing behavior could this break, is the tree coherent alone. Distilled from `experts/software-developer.md`'s code-review section.
- `.claude/agents/feature-implementer-lens-quality.md` - reviews code quality only: readability, dead code, house idiom. Distilled from `experts/software-developer.md`.
- `.claude/agents/feature-implementer-pr-writer.md` - synthesizes every slice's real outcome into one human-facing PR body, blocked work first.
- `.claude/workflows/feature-implementer.js` - the orchestration script: read blueprint, then a sequential per-slice red -> green -> review loop with two separate round caps, then draft PR.
- `.claude/commands/feature-implementer.md` - the `/feature-implementer [feature]` entry point. Locates the blueprint under `docs/testing/<slug>/`, passes both documents' contents, and surfaces blocked slices before the PR body. Does not push or open the PR itself.

## Usage

```
/tdd-blueprint Add a /health endpoint that returns 200 with the app version
/feature-implementer health-endpoint
```

The blueprint must exist first. If `docs/testing/<slug>/` has no `behavior-specs.md` and `tdd-plan.md`, the command stops and tells you to run `/tdd-blueprint` - it will not substitute a ticket or its own reading of the codebase.

This workflow makes real working-tree changes (the test author and developer agents hold `Write`/`Edit`) - it does not just describe what to change. Point it at a scratch or feature branch, review the resulting diff and PR body, and open the actual PR yourself.

## Smoke test

**Status: PASS.** Recorded here per the project's Definition of Done.

The previous ticket-to-PR pipeline's passing run was retired rather than reused: every phase, six of the eight agents, the entry contract, and the per-slice control flow changed, so that result was no longer evidence for this workflow. The run below is the current pipeline's own.

**Setup.** A throwaway ES-module project outside this repo (`wf-test-1`) holding both `tdd-blueprint`'s and `feature-implementer`'s agents, a real `npm test` -> `node --test` runner, and empty `src/` and `test/` directories. `/tdd-blueprint` was run first on a small target - `formatDuration(seconds)` rendering `"1h 2m 3s"`, omitting zero units, `"0s"` for zero, `RangeError` on negative or non-integer input - and produced all six documents (33 unique spec IDs, 9 build steps). Per `CLAUDE.md`'s rule that a smoke test proves wiring rather than production quality, `tdd-plan.md` was copied and trimmed to build steps 1-3 of 9 for the implementation run; the original blueprint was left unmodified.

**Result: the full pipeline ran end to end. 23 agents, 0 errors, $2.38.** Every structured output validated against its schema.

- **Spec IDs survived the whole way.** All 10 tests are named after the blueprint spec they prove (`SPEC-FORMAT-ZERO-DURATION-01: formatDuration(0) returns "0s"`, `SPEC-FORMAT-MULTI-UNIT-COMPACT-08: ...`). This is the property the blueprint pairing exists for, and it held.
- **The red check did real work.** Slices 1 and 2 verified genuinely red before implementation (`npm test` exit 1) and green after (exit 0). **Slice 3 came back `wasGenuinelyRed: false`** - its tests passed before its implementation existed, because slice 2's developer had already over-implemented multi-unit formatting. That is exactly the case this check was added to detect, caught on its first real run, and it is invisible to every other stage since the suite is green either way.
- **The machine gate was truthful.** An independent `npm test` run afterwards returned exit 0 with 10/10 passing, matching the verifier's reported `exitCode: 0` and `ranAtAll: true` on every slice. The gate was not taken on trust.
- **The blueprint reader refused to invent.** Handed the deliberately trimmed plan, it recorded the omission as a gap ("trimmed to build steps 1-3 of 9; steps 4-9 ... not provided in full") instead of silently proceeding or fabricating the missing steps.
- All 3 slices reached `shipped`; `blockedSlices` was empty.

**Honest caveat: the review panel is unproven.** All 9 lens calls (3 lenses x 3 slices) returned `ready` with zero issues. On a task this small and clean that is a plausible outcome, and the lenses did receive the `wasGenuinelyRed: false` signal on slice 3 and could reasonably conclude the tests were real but already satisfied by prior work. But a panel that never flags anything is a panel people learn to ignore, and this run is not evidence that the three lenses do adversarial work. That needs a run against code with a planted defect.

**Also unproven: the blocked path.** No slice failed, so `blockedSlices`, the `## Blocked - do not merge as complete` PR section, and the all-slices-blocked throw were never exercised.

**Operational finding, applies to the whole library.** Headless `claude -p` terminates background tasks after 600 seconds (`Background tasks still running after 600s; terminating`). `/tdd-blueprint` exceeds that, so three separate attempts were billed in full and then killed, producing nothing. Any headless smoke test or unattended run of a long workflow needs `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`. A run terminated at the ceiling still exits 0 and emits a plausible-looking final message, so it is easy to mistake for success.

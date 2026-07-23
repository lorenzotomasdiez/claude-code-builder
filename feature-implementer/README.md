# Feature Implementer

Takes a ticket or user story all the way to a PR-ready working tree: clarify the requirement, plan it into small ordered slices with an architect's eye, implement/test/self-review each slice in turn, and draft the PR body from the real outcome - not from the plan's optimistic description of it.

Built to the same anatomy and quality bar as `prd-generator/` (the canonical template), covering BACKLOG.md item 2.

## Pipeline

```
Clarify (1 agent)
  -> Plan (1 agent, architect lens - ordered list of small slices)
    -> Implement, per slice, IN ORDER:
         implement (1 agent, writes real code)
           -> test (1 agent, writes and runs real tests)
             -> self-review (1 agent, adversarial verdict)
               -> if needs_revision: revise once (re-run implement -> test -> review), then move on regardless
    -> Draft PR (1 agent, synthesizes spec + plan + every slice into one PR body)
```

## Why slices run in a sequential loop, not `parallel()`/`pipeline()`

Every other workflow in this repo (`prd-generator`'s critique lenses, `code-review`'s five review lenses) fans work out in parallel because each lens is independently applied to the *same* fixed input. Implementation slices are not independent: slice 2 is written against the working tree slice 1 already changed, and a later slice can legitimately depend on an earlier one's code existing. Running slices in parallel would mean several agents editing the same working tree at the same time with no idea what the others just wrote - a correctness hazard, not a speedup. So slices are implemented one at a time, in plan order, each with the real summary of every prior slice passed in as context. This is a deliberate deviation from the "fan out where possible" bias elsewhere in this repo, justified by the slices genuinely not being independent - consistent with `CLAUDE.md`'s instruction not to force parallelism where a linear chain is more honest, and not to force a linear chain where a fan-out is more honest.

## Why a capped one-round revise loop, not a critique-until-clean loop

`prd-generator` loops its critique/revise cycle up to `MAX_ROUNDS` because a PRD is one document worth iterating on directly. Here, the loop is scoped to one slice at a time and capped at a single revision round (`MAX_REVISION_ROUNDS = 1`): if a slice still needs work after one revision, the PR-writer agent is told to surface that under "known gaps" rather than the workflow silently looping forever on one slice while the rest of the ticket waits. This mirrors the round-cap pattern in `prd-generator` but keeps the blast radius of an unbounded loop to a single slice, not the whole ticket.

## Why self-review is adversarial and per-slice, not one review at the end

Reviewing the whole feature only after every slice is implemented would let an early slice's bug get built on top of by three later slices before anyone notices. The `feature-implementer-self-reviewer` agent runs immediately after each slice's tests, re-reads the real files (not just the developer's and tester's self-reported summaries), and defaults to catching problems rather than passing them - the same adversarial posture as `code-review-verifier`, applied here to the workflow's own output instead of to an existing diff.

## Files

- `.claude/agents/feature-implementer-clarifier.md` - turns the raw ticket into acceptance criteria, non-goals, and labeled assumptions. Distilled from `experts/software-developer.md`'s technical soft skills and `experts/qa-engineer.md`'s bug-reporting clarity.
- `.claude/agents/feature-implementer-planner.md` - the architect lens: breaks the spec into an ordered list of small, independently reviewable slices. Distilled from `experts/software-architect.md`.
- `.claude/agents/feature-implementer-developer.md` - implements exactly one slice as real code, run once per slice (and again on revision). Distilled from `experts/software-developer.md`.
- `.claude/agents/feature-implementer-tester.md` - writes and actually runs tests for the slice just implemented, proving they can fail on a real regression. Distilled from `experts/qa-engineer.md`.
- `.claude/agents/feature-implementer-self-reviewer.md` - the adversarial per-slice reviewer. Distilled from `experts/software-developer.md`'s code-review section and `experts/qa-architect.md`'s critical-thinking framing.
- `.claude/agents/feature-implementer-pr-writer.md` - synthesizes spec, plan, and every slice's real outcome into one human-facing PR body, including any known gap.
- `.claude/workflows/feature-implementer.js` - the orchestration script: Clarify and Plan sequentially, Implement as a sequential per-slice loop with a capped one-round revise, Draft PR sequentially.
- `.claude/commands/feature-implementer.md` - the `/feature-implementer [ticket]` entry point. Resolves the ticket (issue reference, file, or raw text), calls the workflow, and surfaces the PR body plus each slice's review status. Does not push or open the PR itself.

## Usage

```
/feature-implementer Add a `/health` endpoint that returns 200 with the app version
/feature-implementer 214
/feature-implementer path/to/ticket.md
```

This workflow makes real working-tree changes (it runs the developer and tester agents with `Write`/`Edit`/`Bash`) - it does not just describe what to change. Point it at a scratch or feature branch, review the resulting diff and PR body, and open the actual PR yourself; the command deliberately does not push or open a PR on its own.

## Smoke test

**Status: IN PROGRESS - not yet recorded.** Per the project's Definition of Done, this section will only claim PASS/FAIL once a real run has actually finished; no result is faked here in the meantime.

As with `code-review/`, Claude Code discovers project subagents by walking **up** from the session's working directory, not down into subdirectories - so the smoke test must run from a session whose cwd is `feature-implementer/` itself (see `code-review/README.md` for the full mechanism and its live confirmation).

Because this workflow's developer and tester agents make real file changes, the smoke test is scoped to a trivial, throwaway ticket confined to a scratch subdirectory (`feature-implementer/.smoke-scratch/`, to be deleted immediately after the run) rather than touching any real product code, per this workflow's own "point it at a scratch branch" guidance above and the project rule against polluting real state.

**Reproduction started:** a headless session (`claude -p ... --dangerously-skip-permissions`) was launched with its working directory set to `feature-implementer/`, instructed to call the `Workflow` tool directly with `scriptPath: ".claude/workflows/feature-implementer.js"` and:

```json
{"ticket": "Add a pure function `add(a, b)` that returns the sum of two numbers, in a new file under .smoke-scratch/, plus a test proving it works.", "context": "Trivial smoke-test ticket for the feature-implementer workflow. Keep every change confined to .smoke-scratch/."}
```

This run was still in flight (implementing/testing/self-reviewing real slices takes longer than a text-only pipeline like `code-review`'s) when this iteration's time budget ended. The next iteration should check on it (or re-run it if it did not survive) and record the actual pass/fail result here, then delete `.smoke-scratch/` and confirm `git status` is clean - never write a result here that was not observed from a real run.

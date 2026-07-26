# PRD Generator (Claude Code, no pi)

This is a worked example of replicating a `builder`-style `.pi` agent pipeline
(initializer -> planner -> builder -> tester) using native Claude Code
primitives instead. It generates a PRD from a raw idea, end to end.

The document it produces follows a house PRD standard ("the Perfect PRD"): a
14-section canonical structure (Header, Summary, Problem & Context, Goals &
Metrics, Non-Goals, Users & Use Cases, User Stories, Requirements,
Non-Functional Requirements, Design & UX, Dependencies & Risks, Rollout &
Measurement, Open Questions & Decision Log, Appendix), sized to the work
(`small` / `medium` / `large`), with sourced evidence, testable requirements,
and a critique pass graded against that standard's Quality Checklist rather
than free-form opinion.

## Pipeline

```
Clarify (1 agent)
  -> Research (3 agents in parallel: market, technical, ux)
    -> Draft (1 agent)
      -> Critique (3 agents in parallel: feasibility, completeness, business-value)
        -> Revise (1 agent, loops back into Critique, capped at 2 rounds)
```

## How it maps to pi

| pi concept                          | Claude Code equivalent                          |
|--------------------------------------|---------------------------------------------------|
| `.pi/agents/api-initializer.md`      | `.claude/agents/prd-clarifier.md`                  |
| `.pi/agents/api-planner.md`          | `.claude/agents/prd-researcher.md` (x3, parallel)  |
| `.pi/agents/api-builder.md`          | `.claude/agents/prd-writer.md`                     |
| `.pi/agents/api-tester.md`           | `.claude/agents/prd-critic.md` (x3, parallel)      |
| `.pi/agents/build-api.yaml` (chain)  | `.claude/workflows/prd-generator.js` (orchestration) |
| CLI entry point                      | `.claude/commands/prd-generator.md` (`/prd-generator`) |

The single biggest structural difference: pi's `build-api.yaml` just lists a
team in sequence. Claude Code's workflow script is real control flow - it
can fan agents out in parallel (the research and critique phases each run 3
agents concurrently instead of sequentially) and loop the critique/revise
pair until the reviewers sign off or a round cap is hit.

## Files

- `.claude/agents/*.md` - one subagent per role, each with a narrow job and
  an explicit "what you do not do" section (mirrors pi's separation of
  concerns between initializer/planner/builder/tester).
- `.claude/workflows/prd-generator.js` - the orchestration script. Chains
  Clarify -> Research -> Draft sequentially, fans Research and Critique out
  in parallel, and loops Critique -> Revise up to 2 rounds.
- `.claude/commands/prd-generator.md` - the `/prd-generator <idea>` entry
  point, which runs the workflow and writes the result to
  `docs/product-specs/<slug>-prd.md`.

## Usage

```
/prd-generator A tool that lets small teams track on-call rotations without Slack
```

That's it - the command runs the workflow, the workflow orchestrates the
five agents above, and the final PRD lands in `docs/product-specs/`.

## Smoke test

**Status: not yet run.** Recorded honestly per the project's Definition of Done rule 4.

This workflow is the canonical template and dates from the initial commit, which predates
the smoke-test requirement in `CLAUDE.md`. No end-to-end invocation has ever been recorded
for it, and there is no evidence of one in the git history. Its wiring is verified
mechanically - `node scripts/validate-workflow.mjs prd-generator` passes all ten checks,
including that every `agentType` resolves to an agent definition, every `{schema:}`
reference resolves to a defined const, and every phase used is declared in `meta.phases` -
but mechanical wiring is not the same as a real run, and this section will keep saying so
until someone runs `/prd-generator <a real idea>` and records the result here.

Worth noting for whoever reads this next: the reference implementation that every other
workflow is measured against is one of the packages that has never actually executed.

## Why parallel critique instead of one reviewer

A single `prd-critic` pass tends to rubber-stamp whatever lens it happens to
default to. Running feasibility, completeness, and business-value as three
independent agents against the same draft catches issues a single reviewer
would miss, and the "needs_revision if any lens flags it" rule means the
loop can't exit early just because two out of three lenses were happy.

# Epic Breakdown

Turns a raw idea or a pasted PRD into epics, INVEST-quality user stories with
acceptance criteria, t-shirt estimates, a delivery sequence with real
dependencies, and named delivery risks - a stakeholder-readable backlog
document, not just a list of tickets.

## Pipeline

```
Scope (1 agent: epic-scoper)
  -> Draft Stories (1 agent per epic, independent: story-writer)
    -> Sequence & Estimate (1 agent, over the full set: sequencing-estimator)
      -> Draft (1 agent: breakdown-writer assembles the markdown document)
        -> Critique (3 agents in parallel: feasibility, delivery, invest-quality)
          -> Revise (1 agent: breakdown-writer, loops back into Critique, capped at 2 rounds)
```

## Files

- `.claude/agents/epic-scoper.md` - turns a raw idea/PRD into a small set of
  value-sized epics (goal + boundary), never technical-layer epics.
- `.claude/agents/story-writer.md` - writes INVEST-compliant stories with
  concrete acceptance criteria for one epic. Spawned once per epic, in
  a `pipeline()` so each epic's stories can complete independently.
- `.claude/agents/sequencing-estimator.md` - t-shirt estimates, real
  dependencies, a de-risk-early delivery sequence, and named risks over the
  full set of epics/stories. Runs once, after all stories exist.
- `.claude/agents/breakdown-writer.md` - assembles scope + stories +
  sequencing into one markdown document, and later revises it against
  critique. Never invents content of its own.
- `.claude/agents/feasibility-critic.md`, `delivery-critic.md`,
  `invest-critic.md` - three independent adversarial lenses over the
  assembled document: can this be built as sequenced, does the sequence
  actually honor dependencies and manage delivery risk, and is every story
  INVEST-compliant with testable acceptance criteria.
- `.claude/workflows/epic-breakdown.js` - the orchestration script.
- `.claude/commands/epic-breakdown.md` - the `/epic-breakdown <idea or PRD>`
  entry point, which runs the workflow and writes the result to
  `docs/backlogs/<slug>-epic-breakdown.md`.

## Usage

```
/epic-breakdown A tool that lets small teams track on-call rotations without Slack
```

## Design rationale

**Why one story-writer call per epic instead of one call for the whole
breakdown.** A single writer asked to produce stories for every epic at once
tends to reuse the same shallow story shape across epics and gets sloppier as
the epic count grows. One independent call per epic, run through
`pipeline()`, keeps each epic's stories scoped only to that epic's context
and lets an epic with more stories take longer without blocking the others.

**Why sequencing/estimation is a single pass over everything, not per-epic.**
Estimation in isolation is only sizing; sequencing requires seeing every
story's dependencies at once, including cross-epic ones (an epic's first
story might depend on another epic's foundational story). Splitting this
per-epic would make cross-epic dependencies invisible to the agent that is
supposed to be finding them.

**Why three critique lenses instead of one.** This mirrors `prd-generator`'s
and `code-review`'s core pattern: a single reviewer defaults to whichever
lens it favors and rubber-stamps the rest. Feasibility (can this be built as
sequenced), delivery (does the sequence honor its own dependencies and
manage risk), and invest-quality (is every story actually INVEST-compliant
and testable) are genuinely different failure modes that a single critic
would trade off against each other rather than surface independently. The
"needs_revision if any lens flags it" rule means the loop cannot exit early
just because two of three lenses were happy.

**Why the breakdown-writer, not the sequencing-estimator, owns revision.**
Critique issues can span scope, story quality, and sequencing at once (e.g.
"this story's acceptance criteria are untestable, which also breaks the
estimate that assumed it was well-scoped"). Routing every revision through
one assembling agent that owns the whole document avoids three critics'
feedback fighting over three different upstream agents' outputs each round.

## Dependency note

This workflow takes a raw idea or pasted PRD text directly as `args.brief` -
it does not require another workflow's output, though a PRD produced by
`prd-generator` is a natural input to hand it.

## Smoke test

Status: **PASS** (real end-to-end run, recorded 2026-07-23).

Ran the workflow's required real end-to-end smoke test synchronously
(headless `claude -p` session invoking `/epic-breakdown` from inside
`epic-breakdown/`), with a trivial brief: "a small internal tool that lets a
team track who is on call this week, with a simple swap request flow."

Observed result:
- The pipeline ran to completion with no reported agent errors: Scope,
  Draft Stories (pipelined per epic), Sequence & Estimate, Draft, and two
  full Critique/Revise rounds all produced schema-valid output, and the
  command wrote the final document to
  `docs/backlogs/on-call-tracker-epic-breakdown.md` (343 lines).
- Scope produced 3 epics (On-Call Schedule Setup, View Current On-Call,
  Swap Request Flow) with real goal/boundary splits, not technical-layer
  epics, plus explicit non-goals (no paging integration, no auto-rotation,
  no history/analytics, single-team only).
- Draft Stories produced 18 stories total across the 3 epics via
  independent per-epic `story-writer` calls, each with Given/When/Then
  acceptance criteria covering edge cases (empty roster, duplicate
  requests, no-approver-available, concurrent accept attempts).
- Sequence & Estimate produced a full delivery order honoring cross-epic
  dependencies (schedule setup before visibility before swap requests) and
  flagged real delivery risks up front.
- Critique ran both allowed rounds (hit the 2-round cap): round 1 caught
  concrete issues across all three lenses (a foundational missing
  role/permission model and identity-to-roster mapping flagged by
  feasibility; an inconsistent historical-data claim against Epic 1's
  stated boundary and undefined concurrency semantics flagged by
  delivery/invest-quality); round 2 still had open issues when the cap
  was hit, so the loop correctly returned its best draft rather than
  silently claiming "ready."
- The `breakdown-writer`'s revision behavior held up under real critique
  it could not fully resolve: rather than inventing new stories or
  estimates to paper over the gaps (which its own agent definition
  forbids), it recorded every unresolved issue as an explicit blocking
  gap in the document's Risks and Open Questions sections - including a
  prominent callout at the top of the document about the missing
  permission model - and made only in-scope wording fixes (e.g.
  clarifying an ambiguous "and/or" in an acceptance criterion) and a
  structural split of one overloaded story into two parts without
  fabricating estimates for the new parts.
- No story, risk, or assumption from any upstream agent was silently
  dropped from the final document - the "carry every input item forward"
  instruction in `breakdown-writer.md` held under a real run with 18
  stories and 11 total risks (5 original plus 6 raised anew by critique).

This is an honest "round cap reached with open issues" pass, not a
rubber-stamped "all clean" one - consistent with the workflow's design
intent that a real breakdown surfaces genuine cross-cutting gaps (like a
missing auth/permission model) rather than hiding them to look finished.

`git status` is clean of scratch artifacts - this workflow answers a
planning question and does not mutate code, so nothing needed cleanup
beyond the one output document under `docs/backlogs/`, which is the
command's intended real output location, not scratch.

# Architecture Designer

Produces the architecture document set that "Fundamentals of Software
Architecture" recommends for a new service or feature: a ranked architecture
characteristics scorecard, a component design, Architecture Decision Records
(ADRs), and tech-stack decision records - **for an existing PRD**, not from
a raw idea.

The core discipline this workflow enforces is the book's central claim:
architecture characteristics compete, and a design that does not name its
trade-offs is not finished. Every High-priority characteristic in the
scorecard must state what was traded away for it, every ADR must record a
real rejected alternative and both an upside and a downside, and every
tech-stack choice must state how reversible it is.

## Not autonomous, by design

This workflow does not start from a raw idea. It requires an existing PRD
(e.g. one produced by `prd-generator-v2/`) and refuses to run without one -
`architecture-clarifier` reads the PRD first; if it can't find one, the
workflow throws rather than inventing a design from a bare description.

This is a deliberate hub-and-spoke choice: **the PRD is the one place a
reader starts.** Architecture, design patterns, test blueprints, and any
other document a downstream workflow produces are satellites - each written
to its own file, each linked back from the PRD with one line, never
duplicated into it. A reader who wants deep context on the architecture
follows the link from the PRD; a reader who just wants the product picture
never has to load the architecture document into context at all. See
`prd-generator-v2/README.md`'s Changelog and the two
`reports/context-bloat-forensics/` audits of that package for why this
write-to-disk-and-reference-by-path shape exists in the first place - the
same pattern is applied here rather than reinvented.

## Pipeline

```
Clarify (1 agent - reads the existing PRD, refuses to proceed without one)
  -> Draft (1 agent - writes the document set to disk, links back from the PRD with one edit)
    -> Size check (0-1 agent - one trim pass if the draft exceeds its size ceiling)
      -> Critique (3 agents in parallel: trade-off-rigor, adr-quality, operability - each reads the draft from disk)
        -> Revise (1 agent - reads draft from disk, revises in place, loops back into Critique and Size check, capped at 2 rounds)
```

## Files

- `.claude/agents/architecture-clarifier.md` - reads the PRD at the given
  path and turns it into a structured brief: problem, scope boundary, a
  ranked list of driving architecture characteristics (with rationale),
  constraints, scale expectations, and existing landscape, pulled from the
  PRD's own sections rather than re-elicited from scratch. Reports
  `prdFound: false` instead of inventing a brief if the PRD can't be read.
  Does not design anything itself.
- `.claude/agents/architecture-writer.md` - the only agent that writes the
  document prose: characteristics scorecard, component design, ADRs, and
  tech-stack decision records, following one fixed house structure. Writes
  the document directly to disk (`Write` tool) and, on the first pass only,
  makes one targeted edit (`Edit` tool) to the source PRD's header Links
  row so it references the new document. Handles first-draft, revision, and
  trim passes; never returns document text, only a status
  (`{path, charCount, version, prdLinked}`).
- `.claude/agents/architecture-critic.md` - adversarially reviews a draft
  through exactly one lens per invocation (trade-off-rigor, adr-quality, or
  operability) against a fixed checklist, reading the draft from disk by
  path rather than receiving it inline, and returns `ready` /
  `needs_revision`.
- `.claude/workflows/architecture-designer.js` - the orchestration script:
  Clarify -> Draft sequentially, a size check after Draft and after every
  Revise, then fans Critique out to 3 parallel agents and loops
  Critique -> Revise up to 2 rounds, following `prd-generator-v2.js`'s
  proven shape (draft-by-reference, size-bounded schemas, summary-shaped
  return value).
- `.claude/commands/architecture-designer.md` - the `/architecture-designer
  <path-to-PRD> [focus notes]` entry point. Does not write either file
  itself - the workflow's own `architecture-writer` agent already wrote
  both the architecture document and the PRD's back-reference.

## Usage

```
/architecture-designer docs/product-specs/notification-service-prd.md
/architecture-designer docs/product-specs/notification-service-prd.md focus on the fan-out component only
```

The command runs the workflow; the architecture document lands next to the
PRD (`<prd-dir>/<slug>-architecture.md`), and the PRD's header Links row is
updated to reference it.

## Design rationale

**Why a single expert (software-architect) split into three narrow agents
instead of one agent doing everything.** This backlog item names only one
expert, unlike code-review or technical-solution-proposal which draw on
several. The anatomy's "one subagent per role" requirement is still
satisfied by separating the three distinct *responsibilities* a single
expert performs in the book's own practice: clarifying the driving forces
(clarifier), producing the artifacts (writer), and adversarially checking
them against a checklist (critic) - mirroring `prd-generator-v2`'s
clarifier/writer/critic split rather than inventing a fan-out of experts
that do not exist in `experts/`.

**Why three critique lenses instead of one reviewer.** A single reviewer
tends to default to whichever concern it notices first. Splitting into
trade-off-rigor (does the design own its costs), adr-quality (does each
decision record actually decide something), and operability (could a team
run this) catches distinct classes of defect a single pass would blur
together, and the "needs_revision if any lens flags it" rule (same as
prd-generator-v2 and every other review-style workflow in this repo)
prevents an early clean exit just because two of three lenses were
satisfied.

**Why Clarify and Draft are sequential, not parallel, unlike the
critique phase.** There is only one upstream expert lens here (no
market/technical/ux-style fan-out possible), so there is nothing to
parallelize until the critique stage, where three genuinely independent
checklists exist.

**Why the writer edits the PRD instead of a dedicated linking agent.**
Publishing a document and pointing back to it from its parent are the same
concern (making the document discoverable), not two - adding a fourth agent
for a single targeted `Edit` call would be a narrower role than the anatomy
needs, not a cleaner one. The writer already has `Read`/`Write` for its own
file; adding `Edit`, scoped explicitly to "the Links row only, once, on the
first pass," keeps the blast radius small without a new role.

**Why the size check reapplies after every revise, not just the first
draft, from day one here.** A real run of the sibling `prd-generator-v2`
workflow shipped without this and a revise pass alone grew a draft to over
5x its ceiling before anyone caught it (see that package's Changelog and
`reports/context-bloat-forensics/2026-07-27-workflows-folder-test-prd-generator-v2-run.md`).
This package applies the lesson from the start instead of re-discovering it.

## Smoke test

**Status: PASS.** Run once, end to end, per the project's Definition of Done, against the
refactored (PRD-dependent) design.

- **Input**: `prdPath: docs/product-specs/a-tool-that-lets-small-teams-track-on-call-rotations-without-prd.md`
  (the real PRD produced by `prd-generator-v2/`'s own smoke test), `date: 2026-07-27`, invoked
  directly against `.claude/workflows/architecture-designer.js`.
- **Discovery note**: as with every workflow package exercised inside this repo, its agents
  were temporarily copied to the repo's top-level `.claude/agents/` (how this repo's harness
  resolves subagents) and removed again after the run - see `prd-generator-v2/README.md`'s
  smoke test section for why.
- **Phases that ran**: Clarify (read the PRD, `prdFound: true`) -> Draft (wrote the doc, linked
  the PRD) -> Size check (trimmed once) -> Critique (3 lenses, opus) -> Revise -> Size check
  again -> Critique again, hitting the round cap.
- **Result**: brief correctly derived from the PRD's own sections (top characteristic:
  "Reliability of notification and escalation path"), no re-elicitation of the idea. Draft
  written at 33,110 chars - nearly 2x the 18,000 ceiling - trimmed once to 23,400 (still over,
  logged honestly, proceeded as designed). Round 1 critique: all 3 lenses (trade-off-rigor,
  adr-quality, operability) flagged real issues. Revise ran and grew the doc to 48,500 chars;
  **the post-revise size check fired correctly** (this is the exact bug found in
  `prd-generator-v2` and fixed here from day one) and trimmed to 39,800 - still over ceiling,
  logged honestly, proceeded. Round 2 critique: all 3 lenses still flagged issues, round cap
  (2) hit, best draft returned with `openIssues` populated rather than a fabricated clean pass.
- **PRD link confirmed**: the PRD's header Links row changed from a bare `Tech design`
  placeholder to `Tech design: [Architecture Design](./a-tool-that-lets-small-teams-track-on-call-rotations-without-architecture.md)`
  - a single targeted edit, nothing else in the PRD touched. This is the hub-and-spoke pattern
  working end to end: a reader starting at the PRD finds the architecture doc from one line,
  without either document duplicating the other's content.
- **Confirms both fixes carried over from `prd-generator-v2`**: the size check fired at both
  check points (post-draft and post-revise), and the return value was a bounded summary
  (`openIssuesTotal: 39`, `openIssues` capped to the first 15) rather than the full document or
  critique history. 11 subagents, 37 tool calls, 0 errors.
- **Ceiling adjusted after this run, not yet re-verified**: the original 18,000-char ceiling
  was tight for architecture documents specifically - this real, non-trivial system (multiple
  ADRs, a characteristics scorecard, CAP-position tables) landed at 33,110 chars pre-trim and
  23,400-39,800 post-trim, exhausting the one-trim-attempt cap at both check points.
  `SIZE_CEILING` was raised to 30,000 based on this evidence (architecture docs are inherently
  more table-heavy and less redundant than a PRD of the same scope, so they trim less
  cleanly) - this change is syntax-checked but not yet re-run end to end, flagged honestly
  rather than claiming a re-verification that didn't happen, same as `prd-generator-v2`'s
  Changelog entries.
- **Post-smoke-test fix: `architecture-writer` now measures `charCount` by reading its own
  file back after writing, instead of self-estimating it.** Found by direct code inspection,
  not by this smoke test - a real run of the sibling `tech-stack-selector` workflow showed its
  `stack-author` agent self-reporting `charCount: 32,500` for a file that was actually 71,448
  characters on disk
  (`../reports/context-bloat-forensics/2026-07-27-workflows-folder-test-tech-stack-selector-run.md`).
  `architecture-writer` shares the identical write-and-self-report contract, so a drift like
  that here would silently defeat the `enforceSizeCeiling()` check above - this smoke test's own
  33,110/48,500-char measurements happened to be accurate, but nothing in the prior instructions
  guaranteed that. Not yet re-verified end to end against a fresh run.

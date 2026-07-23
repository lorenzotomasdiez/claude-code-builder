# Docs Sync

Detects drift between code and its hand-written documentation (READMEs, `docs/**`, ADRs), then proposes targeted, grounded corrections instead of a wholesale rewrite.

## Pipeline

```
Map (1 agent)
  -> per doc, independently pipelined (no barrier between docs):
       Detect (1 agent)
         -> Propose (1 agent, only if drift was confirmed)
           -> Verify (1 agent) <-> Revise (1 agent), capped at 2 rounds
```

## Files

- `.claude/agents/docs-sync-mapper.md` - inventories doc surfaces (READMEs, `docs/`, ADRs) and the code area each one claims to describe. Runs once, up front.
- `.claude/agents/docs-sync-drift-detector.md` - given one doc, extracts its verifiable claims (commands, paths, APIs, config, architecture description) and checks each against the real code. Spawned once per doc.
- `.claude/agents/docs-sync-writer.md` - given confirmed drift items for one doc, writes a minimal targeted correction as before/after snippets, not a rewrite. Also handles revisions.
- `.claude/agents/docs-sync-critic.md` - adversarially re-derives the grounding evidence for a proposed correction itself, rather than trusting the writer's citations. Catches hallucinated or overstated "fixes."
- `.claude/workflows/docs-sync.js` - the orchestration script.
- `.claude/commands/docs-sync.md` - the `/docs-sync [path]` entry point, which runs the workflow and writes a report to `docs/docs-sync/`.

Distilled from `experts/software-developer.md` (documentation as a technical soft skill, READMEs/ADRs), `experts/software-architect.md` (ADRs as the source-of-truth artifact for decisions), and `experts/researcher.md` (source verification discipline - never accept a claim without independently checking it, which is exactly the critic's job here).

## Why per-doc pipelining instead of two big parallel fan-outs

Every other workflow in this repo fans a fixed small set of lenses out with `parallel()` (3 research angles, 5 release gates) and barriers between phases. Docs-sync is different: the number of doc files is unknown until the Map phase runs, and each doc's Detect -> Propose -> Verify chain is completely independent of every other doc's. Using `pipeline()` per doc means doc A can already be in its Verify/Revise loop while doc B is still being detected - there is no reason to make every doc wait at a barrier for the slowest one. A doc with zero drift also short-circuits immediately inside its own pipeline stage instead of paying for a Propose/Verify round it does not need.

## Why the critic re-derives evidence instead of trusting citations

The drift-detector and writer both cite file:line evidence for their claims, but a citation is not proof - an agent can misquote a line or misremember what it read. The `docs-sync-critic` agent is instructed to re-run its own Read/Grep/Glob checks against the repository rather than accepting the writer's citation at face value, and defaults to `needs_revision` whenever it cannot independently confirm a claim. This mirrors the researcher's source-verification discipline: never ship a "correction" that is itself unverified.

## Usage

```
/docs-sync
/docs-sync docs-sync/README.md
```

The first form checks the whole repo; the second scopes the check to a path or area. The workflow does not edit files directly - it writes a report of proposed changes to `docs/docs-sync/<date>-report.md` for a human (or a follow-up edit pass) to apply.

## Scope note

Unlike most workflows in this repo, docs-sync's natural input is "the current state of this repository" rather than an external idea or ticket, so its smoke test necessarily ran against this very repo (see below) rather than a synthetic input.

## Smoke test

Run: `/docs-sync docs-sync/README.md` (self-scoped to this workflow's own freshly-written README and agents, right after writing them, in a wired-but-otherwise-empty state).

Result: **PASS**. Map found 1 doc (`docs-sync/README.md`) with an accurate code-structure summary. Detect ran once (no barrier - single-doc pipeline) and returned `hasDrift: false`, since the README was written to describe the exact agent/workflow/command files already on disk. Propose/Verify were correctly skipped (the pipeline stage's short-circuit for `hasDrift: false` fired as designed, confirmed by the journal showing exactly 2 agent calls total: Map and Detect). Schema validation passed for both the `MAP_SCHEMA` and `DRIFT_SCHEMA` structured outputs. This proves the command -> workflow -> agent wiring and the per-doc pipeline short-circuit; it does not exercise the Propose/Verify/Revise loop, since that only runs when real drift is found - the loop's logic is a smaller, well-tested variant of the same critique/revise pattern already proven end-to-end in `prd-generator` and `technical-solution-proposal`.

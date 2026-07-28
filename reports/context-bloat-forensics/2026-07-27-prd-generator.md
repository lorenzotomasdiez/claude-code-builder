## Narrative

The audited folder holds no execution transcripts - every file is a static artifact of the `prd-generator` workflow package (the repo's canonical template), read in full by the auditor. There is one coherent "story" here, but it is a design/config review, not a run log.

The package's shape: `.claude/commands/prd-generator.md` defines the `/prd-generator <idea>` entry point, which calls the Workflow tool with `.claude/workflows/prd-generator.js` as the orchestrator. That script normalizes incoming args (parsing a JSON-encoded string back to an object when needed), then runs five phases in order: Clarify (one `prd-clarifier` agent turns a raw idea into a structured brief), Research (three `prd-researcher` agents run in parallel across market/technical/ux lenses), Draft (one `prd-writer` agent produces the initial PRD markdown), and a capped Critique/Revise loop (three `prd-critic` agents - feasibility, completeness, business-value, on the opus model - review in parallel each round; if any lens returns `needs_revision`, `prd-writer` revises and the loop repeats, capped at 2 rounds). The four agent definition files (`prd-clarifier.md`, `prd-researcher.md`, `prd-writer.md`, `prd-critic.md`) each declare a narrow role, explicit tool allowlist, and explicit "what you do not do" boundaries consistent with this pipeline shape. The `README.md` documents this pipeline, maps it to a prior agent pipeline's roles, and is honest that no true end-to-end smoke test has ever been run - wiring was only verified via a mechanical validator script (`node scripts/validate-workflow.mjs prd-generator`), which passed 10 structural checks but does not substitute for a real invocation.

Because every audited file is a static template/definition rather than a recorded run, the only findings that could be produced come from reading the orchestration script's control flow itself, not from observing runtime behavior.

## Findings

| # | Category | Severity | Recurrence | Evidence | Recommendation |
|---|----------|----------|------------|----------|-----------------|
| 1 | Duplication instead of reference - full draft re-embedded in every critique/revise prompt | Medium | 1 (single root cause, but repeats structurally up to 6x within one workflow run: 3x per critique round x 2 rounds, plus each revise call) | `prd-generator/.claude/workflows/prd-generator.js` lines 111-117 (draft interpolated into 3 parallel `agent()` calls as `<prd_draft>${draft}</prd_draft>`) and lines 134-137 (full draft re-embedded again in the revise prompt) | See recommendation below. |
| 2 | Missing decomposition - critics receive the whole draft regardless of lens or sizing tier | Low | 1 | `prd-generator.js` lines 104-117 - `CRITIQUE_LENSES` fan-out passes the identical full `draft` string to all three lens agents with no section-scoping, despite `brief.sizing` being known at that point | See recommendation below. |
| 3 | Unverified smoke test - canonical template has never had a real end-to-end run recorded | Medium (documentation/process gap, not a code defect) | 1 | `prd-generator/README.md` lines 64-78: smoke test section explicitly states no real invocation has occurred; only `node scripts/validate-workflow.mjs prd-generator` (mechanical schema/wiring check) has been run | See recommendation below. |

No other findings were surfaced upstream (the agent-definition files `prd-writer.md`, `prd-researcher.md`, `prd-clarifier.md`, `prd-critic.md`, and the command file `prd-generator.md` produced no findings - they are static config with no evidenced defects).

## Recommendations for the workflow library

**`prd-generator/.claude/workflows/prd-generator.js`** (findings 1 and 2, both trace to the same file and design gap in the Critique/Revise phase):
- Write the current draft to a scratch file once per critique round (e.g. `prd-draft-round-N.md`) and pass its path to the three parallel `prd-critic` agents and to the `prd-writer` revise call, instead of interpolating the full markdown text into each prompt string. This removes paying the full-draft token cost 3x per round plus again on revise.
- For `large` sizing-tier PRDs specifically, consider splitting the draft into its house-structure sections before critique (or at minimum noting section boundaries in the scratch file) so each `prd-critic` lens agent can be pointed at the sections most relevant to its lens, rather than always receiving the entire document. This is a near-miss for oversized input rather than a current failure, since sizing tiers below `large` are unlikely to be a problem today.
- Since this file is the reference implementation (`prd-generator/` is the canonical template per `CLAUDE.md`), any fix here should be treated as the pattern to propagate to other workflow packages' Critique/Revise loops as they are built or reviewed.

**`prd-generator/README.md`** (finding 3):
- Run the one real, trivial-input, end-to-end smoke test that `CLAUDE.md`'s "Definition of done" already requires, and record the input used, phases that ran, and pass/fail result in the README, replacing or supplementing the current mechanical-validator-only verification. Per the repo's own working agreement, this must be a single real invocation, not a repeated production-quality run.

**Open questions (not findings, worth checking separately):**
- Whether the `BRIEF_SCHEMA` / `FINDINGS_SCHEMA` / `CRITIQUE_SCHEMA` validations in `prd-generator.js` have ever actually caught a malformed agent response in practice, since no run transcript exists to confirm this.
- Whether other workflow packages in this repo that were built after `prd-generator` (per `BACKLOG.md` ordering) copied the same full-draft-reinterpolation pattern in their own critique loops, which would make this a repo-wide pattern rather than isolated to `prd-generator`.

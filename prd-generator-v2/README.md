# PRD Generator v2 (context-bloat-hardened)

This is an experimental sandbox fork of `prd-generator/`, built to prototype fixes for
context-bloat findings raised against the original, before deciding whether to fold them
back into the canonical template.
It is **not** part of the installable workflow catalog - it exists to validate a design,
not to be copied into other projects yet.

It generates the same "Perfect PRD" document as `prd-generator/`, via the same five-phase
pipeline (Clarify -> Research -> Draft -> Critique -> Revise), with the same house PRD
standard, sizing tiers, and agent roles.
What changed is how data moves between phases and what the workflow returns.

## Why this fork exists

Two independent audits of `prd-generator/` (see
`../reports/context-bloat-forensics/2026-07-27-prd-generator.md`, a static read of the
orchestration script, and
`../reports/context-bloat-forensics/2026-07-27-chiri-test-prd-generator-run.md`, a real
end-to-end run captured from the `chiri-test` project) found the same root cause from two
angles:

1. **The full PRD draft was re-embedded in every prompt.** Each critique round interpolated
   the entire draft markdown into all 3 parallel critic prompts, then again into the revise
   prompt - up to 6x the draft's token cost per workflow run.
2. **The workflow's final return value was the full blob** - brief + research + critiques +
   draft, all together. In the real `chiri-test` run this was large enough that the harness
   truncated it (73,357 characters cut), forcing the calling agent to fall back to ad hoc
   `python3`/Bash inspection of the on-disk `.output` file just to pull out the brief and
   critique highlights it actually needed.

Neither of these is a Workflow-tool limitation - workflow scripts have no filesystem access,
so the fix isn't "have the script write a scratch file." It's simpler: give the `prd-writer`
agent the `Write` tool and have *it* write the draft directly to its final destination, then
report back only a path and a size, never the document text. Every other agent that needs
the draft (`prd-critic`, and `prd-writer` itself on revise/trim passes) already has the
`Read` tool and can read that same path instead of receiving the text inline.

## Pipeline

```
Clarify (1 agent)
  -> Research (3 agents in parallel: market, technical, ux)
    -> Draft (1 agent - writes PRD directly to docs/product-specs/<slug>-prd.md, returns {path, charCount, version})
      -> Size check (0-1 agent - one trim pass if the draft exceeds its sizing tier's char ceiling)
        -> Critique (3 agents in parallel: feasibility, completeness, business-value - each reads the draft from disk)
          -> Revise (1 agent - reads draft from disk, revises in place, loops back into Critique, capped at 2 rounds)
```

## What's different from `prd-generator/`

| Aspect | v1 (`prd-generator/`) | v2 (this package) |
|---|---|---|
| `prd-writer` tools | `Read` | `Read`, `Write` |
| Draft handed to critics | Full markdown text interpolated into each prompt | A file path; critics `Read` it themselves |
| Draft handed to revise pass | Full markdown text interpolated into the prompt | A file path; `prd-writer` reads and overwrites it |
| Who writes the final file | The `/prd-generator` command, from the workflow's `prd` return field | The `prd-writer` agent, directly, mid-workflow |
| Workflow return value | `{ brief, research, critiques, prd }` - the full blob | `{ brief: {problem, sizing, goals}, roundsRun, openIssues, prdPath, prdVersion }` - a summary, with the draft already on disk |
| Oversized-draft handling | None | One automatic trim pass if `charCount` exceeds a per-sizing-tier ceiling (small: 4,000 / medium: 16,000 / large: 32,000 chars), logged either way, capped at one retry per check point - re-checked after the initial draft **and** after every revise pass (see Changelog) |
| Structured-output field sizes | Unbounded strings/arrays in `BRIEF_SCHEMA` / `FINDINGS_SCHEMA` / `CRITIQUE_SCHEMA` | Every string field has a `maxLength`, every array has a `maxItems` - schema validation itself forces a retry if an agent tries to return an oversized field |
| `openIssues` in the return value | N/A (v1 has no equivalent field) | Capped at 15 total across all lenses/rounds; `openIssuesTotal` reports the real count when more exist |

## Validators added

Two independent guardrails, both cheap and both logged rather than silently applied:

- **Schema-level**: `maxLength` on every string field and `maxItems` on every array in
  `BRIEF_SCHEMA`, `FINDINGS_SCHEMA`, and `CRITIQUE_SCHEMA`. Structured-output validation
  happens at the tool-call layer, so an agent that tries to return a field beyond these caps
  is forced to retry with a tighter answer - this rejects giant *structured* outputs before
  they ever reach the workflow.
- **Workflow-level**: after the draft is written, the workflow compares `draftStatus.charCount`
  against a per-sizing-tier ceiling. If it's over, one trim pass is requested (same agent,
  told to tighten prose density before ever cutting substance); if it's still over afterward,
  the workflow logs that and proceeds anyway rather than looping indefinitely. This rejects
  giant *unstructured* (markdown) output the schema mechanism can't reach.

## Files

- `.claude/agents/*.md` - the same four roles as `prd-generator/` (clarifier, researcher,
  writer, critic); only `prd-writer.md` has a materially different contract (writes to disk,
  returns status only).
- `.claude/workflows/prd-generator-v2.js` - the orchestration script with the fixes above.
- `.claude/commands/prd-generator-v2.md` - the `/prd-generator-v2 <idea>` entry point. Unlike
  v1's command, it does not write the PRD file itself - the workflow's `prd-writer` agent
  already did.

## Usage

```
/prd-generator-v2 A tool that lets small teams track on-call rotations without Slack
```

## Smoke test

**Status: PASS.** Run once, end to end, per the project's Definition of Done.

- **Input**: `A tool that lets small teams track on-call rotations without Slack`, `date: 2026-07-27`, invoked directly against `.claude/workflows/prd-generator-v2.js`.
- **Discovery note**: this repo's harness resolves subagents from the project's top-level `.claude/agents/`, not from a workflow package's own subdirectory - the same reason `prd-generator/` itself has never run inside this repo (see its README). To actually invoke `prd-generator-v2` here, its four agent files were temporarily copied to the repo's top-level `.claude/agents/`, exactly as a real install into a consuming project would place them, then removed again after the run. This is expected: it's how every workflow in this repo needs to be exercised locally, not a defect in this package.
- **Phases that ran**: Clarify -> Research (market/technical/ux, parallel) -> Draft -> Size check -> Critique (feasibility/completeness/business-value, parallel, opus) -> Revise -> Critique again, hitting the round cap.
- **Result**: brief sizing came back `medium`. Draft written to `docs/product-specs/a-tool-that-lets-small-teams-track-on-call-rotations-without-prd.md` at 20,419 chars - over the medium ceiling (16,000) - which correctly triggered one automatic trim pass down to 17,423 chars (v0.2), logged honestly as still over ceiling, and proceeded rather than looping. Round 1 critique: all 3 lenses flagged `needs_revision` (feasibility, completeness, business-value all found real gaps - dependency owners as role placeholders, orphaned requirements, an unmeasured metric baseline). Revise ran and rewrote the file in place (v0.3, 27,862 chars - grew back past the ceiling while fixing the flagged gaps, which the size check does not re-run after revise). Round 2 critique: all 3 lenses still flagged issues, so the round cap (2) was hit and the workflow returned the best draft with `openIssues` populated rather than pretending the doc was ready.
- **Confirms the fix**: the workflow's own return value was `{ brief: {problem, sizing, goals}, roundsRun: 2, openIssues: [...49 items], prdPath, prdVersion: "v0.3" }` - a bounded summary, never the full draft or research blob. No truncation, no post-hoc file parsing needed to read the result. 13 subagents, 44 tool calls, 0 errors.
- **Note**: this run predates the Changelog fixes below (`openIssues` was not yet capped at the time; it would return 15 + `openIssuesTotal: 49` under the current script). It also surfaced the size-check gap that motivated fix 1.

## Changelog

Two bugs were found from real, independent installs of this package (not repeated smoke
tests of this package by its own maintainers - each is a different consuming project running
`/prd-generator-v2` on its own idea) and fixed here without re-triggering another full
end-to-end run, per the project's guidance against repeating expensive real fan-outs. The
fixes are syntax-checked but **not yet re-verified end to end** - flagging that honestly
rather than claiming a re-run that didn't happen.

1. **Size check now runs after every revise pass, not just after the initial draft.**
   Confirmed twice independently: the smoke test below (v0.2 17,423 -> v0.3 27,862 chars,
   over the medium ceiling) and a second real run in a separate project
   (`../reports/context-bloat-forensics/2026-07-27-workflows-folder-test-prd-generator-v2-run.md`,
   v0.2 4,936 -> v0.3 21,389 chars, over 5x the small ceiling). `enforceSizeCeiling()` is now
   a shared function called after Draft and after every Revise.
2. **`FINDINGS_SCHEMA` caps loosened.** The second real run above showed the `prd-researcher`
   technical lens exhausting the 5-call StructuredOutput retry cap (~20K tokens burned) against
   the original tighter caps and being dropped entirely - losing all technical/dependency
   research for that PRD. `findings`/`risks`/`dependencies` caps were raised (see the schema's
   inline comment) since a real technical-feasibility investigation needs more room than a
   brief field, and losing a whole research lens to retry thrash is worse than a larger field.
3. **`openIssues` capped at 15 total**, with `openIssuesTotal` reporting the real count. The
   second real run's `.output` file hit 32.7KB and got truncated on `cat`, forcing a workaround
   (`ls -la` instead of reading content) - `openIssues` concatenating every lens's every issue
   across every flagged round was the largest uncapped part of the return payload.
4. **`prd-writer` now measures `charCount` by reading its own file back after writing,
   instead of self-estimating it.** Found by direct code inspection after a real run of the
   sibling `tech-stack-selector` workflow showed its `stack-author` agent self-reporting
   `charCount: 32,500` for a file that was actually 71,448 characters on disk
   (`../reports/context-bloat-forensics/2026-07-27-workflows-folder-test-tech-stack-selector-run.md`).
   `prd-writer` uses the identical write-and-self-report contract, so `enforceSizeCeiling()`
   here was trusting the same kind of number that was just shown, elsewhere, to drift by 2.2x -
   a drift like that would silently defeat the size-ceiling check this whole document exists to
   describe. Not yet re-verified end to end against a fresh run of this package specifically.

## Open question for whoever reviews this fork

If this design holds up under the smoke test, the recommendation is to port these three
changes back into `prd-generator/` itself (the canonical template every other workflow is
measured against) rather than maintaining two copies long-term - `prd-generator-v2/` should
be seen as a proposal, not a permanent parallel package.

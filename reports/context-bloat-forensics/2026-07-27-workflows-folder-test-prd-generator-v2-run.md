## Narrative

A single transcript was audited (`f0296b25-e54a-4561-b063-7789c622e9ea.jsonl`), covering one end-to-end run of the `/prd-generator-v2` command against `chiri-requirement.md` (a take-home-assignment brief for an AI Markdown document editor), run from the `workflows-folder-test` project.

The user invoked the command, its prompt expansion instructed the assistant to launch the `prd-generator-v2` workflow directly via the Workflow tool (clarify -> research -> draft -> critique -> revise) and only summarize the result, not author the PRD itself. The assistant read the requirement file into context, then launched the workflow in the background.

During execution, the research phase's technical-lens fan-out agent failed repeatedly against its structured-output schema, burning 8 tool calls and ~20.4K tokens over 152 seconds before hitting the 5-call retry cap and being dropped entirely - the PRD proceeded without technical/dependency research input. The draft phase then produced a 6,118-character draft, which the size-check phase trimmed once to 4,936 chars for the "small" sizing tier (against a ~4,000-char ceiling), logging that it was still oversized but capping itself at one trim attempt (working as designed). Critique ran, at least one lens agent failed after retries in round 1 and was dropped, and round 2 was consumed by the revise step - which, without a size-check afterward, ballooned the PRD to 21,389 characters (v0.3), over 5x the original size ceiling, before the round cap (2) was hit.

On completion, the assistant tried to `cat` the persisted background-task output file, which at 32.7KB exceeded the inline tool-result size limit and was truncated to a preview plus a separately saved file. The assistant worked around this by running `ls -la` on the expected PRD path instead of reading its content, confirmed the file existed (31,904 bytes), and delivered a final summary to the user.

## Findings

| # | Category | Severity | Recurrence | Evidence | Recommendation |
|---|----------|----------|------------|----------|-----------------|
| 1 | Schema/retry thrash in research fan-out | Medium | 1 | `parallel[1] failed: agent({schema}): StructuredOutput retry cap (5) exceeded`; agent index 3: tokens 20,361, toolCalls 8, durationMs 152,335, state "error" | Simplify/loosen the `prd-researcher` technical-lens output schema (the `maxLength`/`maxItems` caps added in this fork) or add a schema example/repair hint so retries succeed early, instead of exhausting 5 attempts and dropping the entire technical-feasibility research lens. |
| 2 | Size gate not reapplied after revise, PRD balloons past ceiling | Medium | 1 (second independent confirmation - also flagged in the v2 smoke test) | Draft (idx 5) 6,118 chars -> size-check (idx 6) trims to 4,936 chars, logged "Still oversized after one trim pass... capped at one trim attempt"; revise (idx 10) then outputs 21,389 chars (v0.3) with no subsequent size-check | Re-run the sizing-tier trim/size-check phase after the revise step (not only after the initial draft) so a single revision pass cannot silently blow past the tier's size ceiling before delivery. |
| 3 | Oversized orchestrator output truncated on read | Low | 1 | `cat` of `tasks/*.output` (32.7KB, persistedOutputSize 33,447) truncated to a 2KB preview, full content redirected to a separate tool-results file | Cap the total `openIssues` returned (across all lenses/rounds) to keep the workflow's own return payload lean, rather than relying on the calling agent to work around truncation with `ls`/partial reads. |

## Cross-reference

Finding 2 is now confirmed twice independently: once as a documented "known gap" in `prd-generator-v2/README.md` from its own smoke test (v0.2 at 17,423 chars -> v0.3 at 27,862 after revise, over the medium ceiling), and again here in a real second install, on a different idea, at `small` sizing (v0.2 at 4,936 chars -> v0.3 at 21,389, over 5x the ceiling). This is a real, repeatable defect in `prd-generator-v2`, not a one-off - the size check needs to run after every phase that can grow the draft, not just after the first draft.

Finding 1 is new: it was not exercised by the smoke test (whose research phase succeeded cleanly) but appeared on this second, independent idea. The `maxLength`/`maxItems` schema constraints added to bound structured output (the intended fix for oversized *structured* fields) may themselves be too tight for the technical lens specifically, given how much a real technical-feasibility investigation tends to produce - causing repeated validation failures until the retry cap is hit and the lens is dropped entirely, which is worse for PRD quality than a slightly oversized structured field would have been.

## Recommendations for the workflow library

**`prd-generator-v2/.claude/agents/prd-researcher.md`** (technical/dependency lens)
- Loosen the technical lens's `findings`/`risks`/`dependencies` caps in `FINDINGS_SCHEMA`, or split the technical lens into narrower sub-investigations, so retries succeed on the first or second pass.

**`prd-generator-v2/.claude/workflows/prd-generator-v2.js`** (size-check / sizing-tier gate)
- Move the size-check to run after every `prd-writer` call that can grow the document (draft, and each revise pass), not only after the initial draft.

**`prd-generator-v2/.claude/workflows/prd-generator-v2.js`** (return payload size)
- Cap total `openIssues` returned to a bounded top-N (e.g. the most recent round's issues, or the first N per lens) instead of concatenating every lens's every issue across every round that flagged `needs_revision`.

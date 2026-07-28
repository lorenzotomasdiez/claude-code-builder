## Narrative

The audited folder contains a single transcript covering one real end-to-end run of the `prd-generator` workflow (invoked from the `chiri-test` project), followed by a manual revision pass on its output.

The user invoked `/prd-generator` with a seed document (`@docs/requirement-shaping/scoped-ai-co-editing-markdown/prd-seed.md`). The command dispatched the Workflow tool against `.claude/workflows/prd-generator.js` with `idea` and `date` args, launching a background task that ran the clarify -> research -> draft -> critique -> revise pipeline across 12 subagents. The workflow completed cleanly (zero errors, zero empty results), consuming 170,443 subagent tokens and 28 tool uses over about 462 seconds, and wrote the PRD to `docs/product-specs/scoped-ai-co-editing-markdown-prd.md` (v0.2, ~32k chars).

When the result was delivered back to the main session via a task-notification queue operation, the harness truncated it (73,357 characters cut) and pointed to a `.output` file on disk. The assistant then ran a series of `python3`/Bash calls to inspect that file directly - first listing top-level keys, then drilling into `result.brief`, `result.research`, `result.critiques`, `result.prd` - to extract just the brief and critique highlights it needed, rather than receiving a right-sized structured result.

The assistant summarized the brief (sizing: small) and critiques for the user. The user then asked for three specific PRD changes: replace the hardcoded model requirement (R-13) with a user-changeable OpenRouter model picker defaulting to gpt-4o-mini, make the editor library technology-agnostic (remove Tiptap references), and defer UX decisions out of the coding phase. The assistant first did a full `Read` of the entire ~68KB generated PRD (about 26.5k tokens, near the single-read cap) to orient itself, then made dozens of targeted `Edit` calls across the document, running a `grep` mid-edit to confirm no remaining Tiptap references. It concluded with a summary confirming the PRD was updated to v0.3 with all three changes applied.

## Findings

| # | Category | Severity | Recurrence | Evidence | Recommendation |
|---|----------|----------|------------|----------|-----------------|
| 1 | Duplication - identical large payload logged twice | High | 1 (single transcript, one occurrence) | Transcript lines 19 and 21: byte-for-byte identical `<task-notification>` block (same `<result>`, `<diagnostics>`, `<usage>`) appears once as a queue-operation "enqueue" event and again as the delivered user turn | Harness/orchestration layer should log only a task-id/status pointer for enqueue events, not the full payload, and deliver the full content exactly once to the consuming agent. This is outside this repo's workflow scripts - flag to whoever owns the Workflow-tool harness. |
| 2 | Oversized workflow result forcing ad hoc file parsing | Medium | 1 | Lines 19-25: result truncated at 73,357 chars cut; assistant fell back to `python3`/Bash calls against the on-disk `.output` file to inspect and extract `brief`/`research`/`critiques`/`prd` keys | `prd-generator.js`'s final result assembly should return only what the `/prd-generator` command actually consumes (brief summary, sizing tier, critique highlights, path to written PRD) instead of the full brief+research+critiques+prd blob, keeping the structured output well under the truncation threshold. |
| 3 | Oversized input - full-file Read before targeted edits | Low | 1 | Lines 44-45: full `Read` of ~68KB (~26.5k tokens, near the 25k single-read cap) generated PRD file, followed at lines 119-120 by a `grep` that could have been run first | For large generated documents, run the targeted grep/search for terms needing change first, then Read only the surrounding line ranges per match; reserve a full-file Read for edits that genuinely span the whole document. |

## Recommendations for the workflow library

**`prd-generator/.claude/workflows/prd-generator.js`** (the orchestration script / harness boundary)
- Trim the final result object returned to the command layer to a summary-shaped payload (brief text, sizing tier, top critique points, output file path) rather than embedding the full brief + research + critiques + prd content. This addresses finding 2 and, as a side effect, shrinks the payload that risks being duplicated per finding 1.
- This is the reference/canonical workflow per `CLAUDE.md`, so any fix here (returning references/paths instead of pasted full content) should be treated as the new standard other workflows copy.

**Task-notification / queue harness** (outside this repo's workflow scripts, but exercised by every workflow invocation)
- File this as an infrastructure fix, not a workflow-file fix: enqueue events should carry a task-id/status pointer only; the full result body should be delivered once, not logged twice.

**`/prd-generator` command usage pattern** (post-generation editing step)
- When a user requests targeted edits to a large generated artifact (e.g., the PRD file), default to grep-then-range-Read instead of full-file Read, reserving full reads for edits that span the whole document. This is a usage-pattern note, not a code change to the workflow itself.

## Cross-reference

This confirms and sharpens the earlier static-file review (`reports/context-bloat-forensics/2026-07-27-prd-generator.md`), which flagged the full-draft-reinterpolation pattern in the critique/revise loop from reading the orchestration script alone. This real-run audit adds a second, independently-confirmed root cause: the workflow's *final return value* is also an unbounded full blob, not just the intermediate critique-loop prompts - and this one has now caused an actual truncation + ad hoc file-parsing incident in production use.

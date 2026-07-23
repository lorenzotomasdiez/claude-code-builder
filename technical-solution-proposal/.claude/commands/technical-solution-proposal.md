---
description: Turn a PRD into a technical solution proposal via a cross-examining expert panel debate
argument-hint: <path to a PRD, or a raw feature/product description>
---

Produce a technical solution proposal for: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/technical-solution-proposal.js`
- `args`: a JSON object literal `{ "prd": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string). If `$ARGUMENTS` is a file path, read the file first and pass its contents as `prd` instead of the bare path, so the scoper works from the real PRD text.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the brief's `problem` field.
2. Write the returned `proposal` field to `docs/technical-proposals/<slug>-proposal.md` (create the folder if it does not exist).
3. Summarize for the user: the brief's problem statement, how many debate rounds ran, how many challenges were raised in total, and any disagreements the synthesis left as open trade-offs rather than resolving unilaterally.

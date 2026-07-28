---
description: Generate a PRD from a raw idea via clarify -> research -> draft -> critique -> revise, with size-bounded output
argument-hint: <raw product idea>
---

Generate a PRD for this idea: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/prd-generator-v2.js`
- `args`: a JSON object literal `{ "idea": "$ARGUMENTS", "date": "<today's date as YYYY-MM-DD, from your own system context>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Fill in the real current date yourself - it becomes the PRD's "Last updated" field.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. The PRD is already written to disk at the `prdPath` the workflow returns - do not write it yourself, the workflow's own `prd-writer` agent wrote it directly (this is deliberate: it keeps the full document out of the workflow's return value and out of your context).
2. Summarize for the user: the brief (including the sizing tier the clarifier chose), how many critique rounds ran (`roundsRun`), and any issues still open (`openIssues`) when the round cap was hit - note if `openIssuesTotal` is larger than the `openIssues` list returned (it's capped at 15; more exist in the draft's own critique history). Remind the user that the `DRI` and `Reviewers` fields in the document header are placeholders they need to fill in.
3. Mention the file path (`prdPath`) so the user knows where to find it.

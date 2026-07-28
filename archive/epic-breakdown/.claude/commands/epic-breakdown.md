---
description: Turn a PRD or raw idea into epics, stories with acceptance criteria, estimates, sequencing, and risks
argument-hint: <raw idea or pasted PRD text>
---

Break this down into epics and stories: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/epic-breakdown.js`
- `args`: a JSON object literal `{ "brief": "$ARGUMENTS", "date": "<today's date as YYYY-MM-DD, from your own system context>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Fill in the real current date yourself - it becomes the document's header date.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the brief.
2. Write the returned `breakdown` field to `docs/backlogs/<slug>-epic-breakdown.md` (create the folder if it does not exist).
3. Summarize for the user: how many epics and stories were produced, how many critique rounds ran, and any issues still open when the round cap was hit.

---
description: Synthesize real git activity into a stakeholder-readable status update, tuned per audience
argument-hint: <period, audiences, and optional ticket context>
---

Generate a status report for this request: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/status-report.js`
- `args`: a JSON object literal `{ "request": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Write each audience's report to `docs/status-reports/<date>-<audience>.md` (create the folder if it does not exist), using today's date as `<date>`.
2. Summarize for the user: the period covered, how many commits were found, which audiences were produced, and any critique round that hit the cap with issues still open.

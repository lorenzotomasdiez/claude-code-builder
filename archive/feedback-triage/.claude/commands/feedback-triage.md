---
description: Cluster raw user feedback into themes and prioritize it into ranked product bets
argument-hint: <raw feedback dump - tickets, reviews, survey text, call notes>
---

Triage this raw feedback: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/feedback-triage.js`
- `args`: a JSON object literal `{ "feedback": "$ARGUMENTS", "date": "<today's date as YYYY-MM-DD, from your own system context>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Fill in the real current date yourself - it becomes the document's header date.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug summarizing the feedback batch (e.g. by product area or date range).
2. Write the returned `triage` field to `docs/feedback-triage/<slug>-feedback-triage.md` (create the folder if it does not exist).
3. Summarize for the user: how many themes and bets were produced, how many critique rounds ran, and any issues still open when the round cap was hit.

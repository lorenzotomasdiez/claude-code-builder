---
description: QA a service/area end to end - architect a test strategy, write the missing tests, run the suite, verify coverage, and report
argument-hint: <service or area to QA, e.g. "the auth API">
---

Run a full QA pass on: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/qa-suite.js`
- `args`: a JSON object literal `{ "target": "$ARGUMENTS", "context": "<optional: anything you already know about where this lives, the runner, or what matters most>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). If you have no extra context, pass `{ "target": "$ARGUMENTS" }`.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the target.
2. Write the returned `report` field to `docs/qa-reports/<slug>-qa.md` (create the folder if it does not exist).
3. Summarize for the user: the overall verdict, how many tests were newly written, the actual pass/fail counts, any defects found in the code under test, and any gaps still open against the proposed strategy (with their priority). If the coverage verdict was `incomplete` at the round cap, say so plainly rather than presenting the run as finished.

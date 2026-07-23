---
description: Detect drift between code and its docs/README/ADRs, and propose targeted grounded corrections
argument-hint: [optional path or area to scope the check to]
---

Check documentation for drift against the current code. Scope: $ARGUMENTS (if empty, check the whole repository).

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/docs-sync.js`
- `args`: a JSON object literal `{ "scope": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string). If `$ARGUMENTS` is empty, pass `{ "scope": "the entire repository" }`.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. If `results` is empty, tell the user no hand-written docs were found in scope and stop here.
2. Write a report to `docs/docs-sync/<date>-report.md` (create the folder if it does not exist) listing, per doc with confirmed drift: the drift items found, the proposed before/after snippets, the final critic verdict, and how many revision rounds it took. Docs with no drift can be listed in one summary line each.
3. Summarize for the user: how many docs were checked, how many had confirmed drift, and flag any doc where the round cap was hit with issues still open - those need a human look before the proposed text is trusted.
4. Remind the user that proposed snippets are suggestions to apply by hand (or via a follow-up edit) - this workflow does not write directly into the doc files itself.

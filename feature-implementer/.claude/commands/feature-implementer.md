---
description: Take a ticket or user story to a PR - clarify, plan into slices, implement/test/self-review each slice, and draft the PR body
argument-hint: [ticket text, file path, or issue number/URL - defaults to asking the user for the ticket if omitted]
---

Implement this ticket: $ARGUMENTS

1. Determine the ticket text to implement:
   - If `$ARGUMENTS` names an issue (a number or URL), fetch it with `gh issue view`.
   - If `$ARGUMENTS` names a file path, read that file's contents.
   - Otherwise treat `$ARGUMENTS` as the raw ticket/user story text.
   - If there is no ticket text at all, ask the user for it and stop - do not call the workflow with empty input.

2. Call the Workflow tool now, as an actual tool call (not a description of one), with:
   - `scriptPath`: `.claude/workflows/feature-implementer.js`
   - `args`: a JSON object literal `{ "ticket": "<the ticket text>", "context": "<any extra context - target repo area, related tickets, constraints>" }` (an actual object in the tool call payload, NOT a JSON-encoded string).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

3. When it returns, show the user the `prBody` field directly as the PR description. Also summarize, per slice, whether it reached `ready` on self-review or still has open issues (from `slices[].review`), so the user knows what to double-check before actually opening the PR.

4. Do not push a branch or open the actual PR yourself unless the user explicitly asks you to - this command produces the PR body and the working-tree changes; opening the PR is a separate, confirmable action.

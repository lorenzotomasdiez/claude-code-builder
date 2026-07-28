---
description: Produce an architecture document set (characteristics, components, ADRs, tech stack) FOR AN EXISTING PRD via clarify -> draft -> critique -> revise
argument-hint: <path to an existing PRD, plus optional focus notes>
---

Design the architecture for the PRD at: $ARGUMENTS

This workflow is not autonomous - it designs architecture for a PRD that already exists, and refuses to
run if it can't find one. If `$ARGUMENTS` does not look like a path to an existing PRD file (e.g. it reads
like a raw idea instead), stop and tell the user to point this command at a PRD path, or generate one first
with `/prd-generator-v2 <idea>`. Otherwise, split `$ARGUMENTS` into the PRD path and, if there is text after
it, an optional focus note (which part of the PRD to concentrate on).

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/architecture-designer.js`
- `args`: a JSON object literal `{ "prdPath": "<the PRD path>", "date": "<today's date as YYYY-MM-DD, from your own system context>", "focus": "<the optional focus note, or omit this field entirely if there isn't one>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Fill in the real current date yourself - it becomes the document's "Last updated" field.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. The architecture document is already written to disk at the `architecturePath` the workflow returns, and the source PRD already links to it (`prdLinked`) - do not write either file yourself, the workflow's own `architecture-writer` agent did both directly (this is deliberate: it keeps the full document out of the workflow's return value and out of your context, and keeps the PRD as the one place a reader starts).
2. Summarize for the user: the brief's top-ranked characteristics, how many critique rounds ran (`roundsRun`), and any issues still open (`openIssues`) when the round cap was hit - note if `openIssuesTotal` is larger than the `openIssues` list returned (it's capped at 15). If `prdLinked` is false, tell the user the PRD's Links row could not be updated automatically and point them at it.
3. Mention the file path (`architecturePath`) so the user knows where to find it.

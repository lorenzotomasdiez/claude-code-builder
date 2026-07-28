---
description: Turn a PRD into a researched, weighted tech-stack decision matrix - candidates, evidence, trade-offs, and a recommendation per decision area
argument-hint: <path to a PRD, or the product description itself> [| constraints]
---

Select a tech stack for this: $ARGUMENTS

The argument may be a path to a PRD file, a product description, or either of those followed by `|` and a constraints clause (team size and skills, budget, deploy target, timeline, existing systems, compliance).

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/tech-stack-selector.js`
- `args`: a JSON object literal `{ "prd": "<the PRD path or text, everything before the | >", "constraints": "<everything after the |, or 'none stated'>", "date": "<today's date as YYYY-MM-DD, from your own system context>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Fill in the real current date yourself - it becomes the document's "Last updated" field and the as-of date for every version and price in it.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. The document is already written to disk at the `stackPath` the workflow returns - do not write it yourself, the workflow's own `stack-author` agent wrote it directly. If `$ARGUMENTS` pointed at a real PRD file (not an inline description), the PRD's Links row was also updated to reference it (`prdLinked`) - if `prdLinked` is false despite a PRD path being given, tell the user the automatic link failed and point them at both files.
2. Summarize for the user: the decision areas and their winners with confidence levels, how many critique rounds ran (`roundsRun`), any decision area that came back low confidence or on a close margin, and any issues still open (`openIssues`) when the round cap was hit - note if `openIssuesTotal` is larger than the `openIssues` list returned (it's capped at 15).
3. Mention the file path (`stackPath`) so the user knows where to find it. If the PRD was linked, tell the user `/architecture-designer <that PRD path>` will now pick these decisions up automatically - no more pasting the document into anything.

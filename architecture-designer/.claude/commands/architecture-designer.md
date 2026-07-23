---
description: Produce an architecture document set (characteristics, components, ADRs, tech stack) from a raw request via clarify -> draft -> critique -> revise
argument-hint: <new service or feature architecture request>
---

Generate an architecture design for this request: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/architecture-designer.js`
- `args`: a JSON object literal `{ "request": "$ARGUMENTS", "date": "<today's date as YYYY-MM-DD, from your own system context>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Fill in the real current date yourself - it becomes the document's "Last updated" field.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the request.
2. Write the returned `architecture` field to `docs/architecture/<slug>-architecture.md` (create the folder if it does not exist).
3. Summarize for the user: the brief's top-ranked characteristics, how many critique rounds ran, and any issues still open when the round cap was hit.

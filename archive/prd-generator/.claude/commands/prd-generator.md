---
description: Generate a PRD from a raw idea via clarify -> research -> critique -> revise
argument-hint: <raw product idea>
---

Generate a PRD for this idea: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/prd-generator.js`
- `args`: a JSON object literal `{ "idea": "$ARGUMENTS", "date": "<today's date as YYYY-MM-DD, from your own system context>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Fill in the real current date yourself - it becomes the PRD's "Last updated" field.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the idea.
2. Write the returned `prd` field to `docs/product-specs/<slug>-prd.md` (create the folder if it does not exist).
3. Summarize for the user: the brief (including the sizing tier the clarifier chose), how many critique rounds ran, and any issues that were still open when the round cap was hit. Remind the user that the `DRI` and `Reviewers` fields in the document header are placeholders they need to fill in.

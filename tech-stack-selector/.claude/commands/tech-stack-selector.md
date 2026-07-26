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
1. Derive a short kebab-case slug from the product.
2. Write the returned `stackDocument` field to `docs/architecture/<slug>-tech-stack.md` (create the folder if it does not exist).
3. Summarize for the user: the decision areas and their winners with confidence levels, how many critique rounds ran, any decision area that came back low confidence or on a close margin, and any issues still open when the round cap was hit.
4. Tell the user they can feed this document into `/architecture-designer` by pasting it into the request, so the architecture cites these decisions instead of re-deriving them.

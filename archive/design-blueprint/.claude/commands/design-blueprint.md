---
description: Turn a product idea or PRD into a set of buildable UX/UI design documents via a UX/product/growth panel debate
argument-hint: <a product idea, or a path to a PRD>
---

Produce a design blueprint for: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/design-blueprint.js`
- `args`: a JSON object literal `{ "idea": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string). If `$ARGUMENTS` is a file path, read the file first and pass its contents as `idea` instead of the bare path, so the framer works from the real text.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the brief's `product` field.
2. Write each entry of the returned `documents` array to `docs/design/<slug>/<document.key>.md` (create the folder if it does not exist). There are four: `design-decisions.md`, `user-flows.md`, `screens-and-ui.md`, `landing-page.md`.
3. Summarize for the user: the product direction, how many debate rounds ran, the prioritized scope split (how many must / should / later), the core user flows and landing sections that were decided, and any trade-offs the synthesis left open rather than resolving. Give them the path to the `docs/design/<slug>/` folder.

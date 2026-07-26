---
description: Turn a PRD plus architecture and design docs into the test blueprint a developer does TDD from - strategy, Given/When/Then specs, red-green build order, traceability. Writes no code.
argument-hint: <what is being built, or a path to a PRD / architecture / design doc>
---

Produce the TDD blueprint for: $ARGUMENTS

First, gather the upstream documents if they exist in this repo: look for a PRD under `docs/product-specs/`, architecture documents under `docs/architecture/`, and design documents under `docs/design/`, matching whatever $ARGUMENTS refers to. Read the ones you find.

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/tdd-blueprint.js`
- `args`: a JSON object literal (an actual object in the tool call payload, NOT a JSON-encoded string) shaped `{ "target": "$ARGUMENTS", "prd": "<the PRD text you read, or omit>", "architecture": "<the architecture doc text you read, or omit>", "design": "<the design doc text you read, or omit>" }`. Pass the file *contents* you read, not bare paths, so the framer works from the real text. Omit any key you found no document for - the workflow runs from `target` alone.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the brief's `product` field.
2. Write each entry of the returned `documents` array to `docs/testing/<slug>/<document.key>.md` (create the folder if it does not exist). There are six: `test-strategy.md`, `behavior-specs.md`, `tdd-plan.md`, `test-data-and-fixtures.md`, `nfr-test-plan.md`, `traceability-matrix.md`.
3. Summarize for the user: the number of behavior slices and specs produced, how many critique rounds ran and whether all three lenses signed off, the number of build steps and the first failing spec of step 1, anything the traceability matrix marks `partial` or `uncovered`, any orphan specs, any assumed thresholds a human needs to set, and any critique issues still open at the round cap. Give them the path to the `docs/testing/<slug>/` folder.
4. Remind them that this workflow deliberately produced no test code: the point is that the developer (or `/feature-implementer`) writes the first failing test themselves from `tdd-plan.md`.

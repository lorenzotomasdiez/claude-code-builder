---
description: Turn a vague client ask into a buildable proposal via a 10-expert panel with research, debate, a scope cut, and an honest case against building
argument-hint: <what the client asked for, or a path to their brief>
---

Shape this client requirement: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/client-requirement-shaping.js`
- `args`: a JSON object literal `{ "ask": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). If `$ARGUMENTS` is a file path, read the file first and pass its contents as `ask` instead of the bare path, so intake works from the real text. If you already know useful background about the client, their existing product, or their constraints, pass it as a `context` field.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

This is a large run: 8 debating experts plus 2 outside voices, with real web research and up to 3 debate rounds. Expect roughly 25 to 45 agent calls. Do not run it twice on the same ask.

When it returns:
1. Derive a short kebab-case slug from `decisions.productName`, or from the brief's restated need if that field is empty.
2. Write the returned `proposal` field to `docs/requirement-shaping/<slug>/proposal.md` (create the folders if they do not exist).
3. Write the returned `prdSeed` field to `docs/requirement-shaping/<slug>/prd-seed.md`.
4. Summarize for the user, and lead with the parts they cannot get from skimming the document:
   - what the client asked for versus what the panel concluded they actually need, if those differ
   - the reductionist's verdict (`proportionate` or `overbuilt`), their one-sentence cut, and how many items they cut
   - the devil's advocate's verdict and their single strongest objection - **state this even when the verdict was `worth_building`**
   - how many debate rounds ran, whether the outside voices were answered or the round cap was hit with objections still standing
   - the number of unresolved debates the synthesis recorded, and the overall confidence level with its reasoning
   - how thin or solid the research evidence was (count of low-confidence findings and any gaps that matter)
5. Tell them the next step: read `proposal.md`, discuss and adjust it with you, and when they are happy, run `/prd-generator` with the contents of `prd-seed.md` as the idea.

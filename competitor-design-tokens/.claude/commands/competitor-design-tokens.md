---
description: Find real competitor landing pages, extract REAL styling evidence from each (CSS custom properties and/or computed styles, plus per-component screenshots - nav/hero/cta/card/footer, never full-page), pick the single best-in-class reference, and write design-tokens.md for your own product grounded in that evidence
argument-hint: <your product/niche, e.g. "our AI note-taking app"> [comma-separated competitor URLs to skip discovery]
---

Run competitor design-token extraction for: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/competitor-design-tokens.js`
- `args`: a JSON object literal `{ "target": "$ARGUMENTS", "runId": "<timestamp>", "context": "optional extra context" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted).
  - `runId`: generate a timestamp yourself from your own system context, formatted `YYYYMMDD-HHMMSS` (the workflow cannot generate time, so you must supply it). It names this run's folder `design-research/competitor-design-tokens-<runId>/`.
  - If the user already named specific competitors or pasted URLs, also pass `competitors`: an array of `{ "name": "...", "url": "..." }` - this skips the Scout (discovery) phase entirely and captures exactly those.

This workflow drives a real browser via `playwright-cli`, which must be installed and on PATH (`npm install -g @playwright/cli@latest`). If it is missing or a competitor's site isn't reachable, that capture reports `blocked` rather than failing the whole run.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the product/niche.
2. Write the returned `tokensDoc` field to `docs/design-system/<slug>/design-tokens.md` (create the folder if it does not exist) - this is the caller's real deliverable, meant to be used directly as their design docs / fed into `/design-system-foundation` or straight to implementation.
3. Summarize for the user: which competitor was chosen as the reference and why (the judge's rationale), any borrowed elements from runners-up, and any contrast-driven adjustments the token-author had to make. Point to the screenshots under the returned `runDir` for visual evidence. If any competitor came back `blocked`, say so plainly.

---
description: Turn a raw task into an exhaustive, verification-bearing backlog.md and a ready-to-launch GNHF worker prompt, so nothing gets missed before an autonomous GNHF run starts grinding through it
argument-hint: <task, e.g. "update all the design docs, write the tests and implementations, and verify everything works">
---

Turn this task into a GNHF-ready backlog: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/gnhf-backlog-maker.js`
- `args`: a JSON object literal `{ "task": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). If the user named a specific backlog file path, also pass `"backlogPath": "<that path>"` - otherwise it defaults to `docs/build-plan/backlog.md`.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Write the returned `backlogDoc` field to the returned `backlogPath` (creating parent directories if needed). This overwrites that path with the full merged content (existing rows preserved plus the new ones) - that is intentional, the workflow already merged rather than replaced.
2. Derive a short kebab-case slug from the task and write the returned `gnhfPrompt` field to `docs/build-plan/<slug>-gnhf-prompt.md`, as a copy-paste-ready reference.
3. Summarize for the user: how many new rows were added (and the row id range), any `nonGoals` the decomposer excluded and why, how many critique rounds ran and what they caught, and the detected gate-chain commands. If the round cap was hit with open issues, say so plainly rather than presenting the backlog as fully clean.
4. Tell the user the backlog and prompt are ready, and that they can now invoke the `gnhf` skill with the `gnhfPrompt` content as the worker prompt (Hands-Off mode for a bounded task like this, Companion mode if they want to supervise) - point them at the written prompt file rather than re-typing it.

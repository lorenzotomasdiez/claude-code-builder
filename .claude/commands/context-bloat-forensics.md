---
description: Audit a folder of Claude Code transcripts for context-bloat anti-patterns and write a consolidated report
argument-hint: <folder path holding transcripts to audit>
---

Audit the transcripts under this folder for context-bloat: $ARGUMENTS

This is a local, repo-internal tool for improving the workflows in this library - it is not part of the installable workflow catalog, so do not suggest installing it elsewhere.

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/context-bloat-forensics.js`
- `args`: a JSON object literal `{ "folder": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. If `files` is empty, tell the user no transcript-like files were found under that folder and stop.
2. Derive a short kebab-case slug from the folder name and today's date (YYYY-MM-DD from your own system context).
3. Write the returned `report` field to `reports/context-bloat-forensics/<date>-<slug>.md` (create the folder if it does not exist).
4. Summarize for the user: how many files were audited, the top 3 findings by severity, and the report's file path.

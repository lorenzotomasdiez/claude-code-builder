---
description: Assess, apply, and verify a dependency upgrade (breaking changes, security advisories, migration plan)
argument-hint: <dependency> <target version> [current version] [scope]
---

Upgrade this dependency: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/dependency-upgrade.js`
- `args`: a JSON object literal `{ "dependency": "<name>", "toVersion": "<target version>", "fromVersion": "<current version, or omit to have it detected from the manifest>", "scope": "<repo path, or omit for the whole repo>" }` (an actual object in the tool call payload, NOT a JSON-encoded string). Parse these fields out of `$ARGUMENTS` yourself.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Summarize the assessment: breaking-change risk level and the affected call sites found, the security recommendation and urgency, and the migration plan's rollback step.
2. Report what the applier actually changed (files and a one-line description each).
3. State the final verify verdict plainly. If it is `fail` after the round cap, say so clearly and name the specific failure - do not present it as done.

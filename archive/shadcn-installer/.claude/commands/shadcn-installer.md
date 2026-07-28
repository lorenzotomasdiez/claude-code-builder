---
description: Install shadcn/ui into the current project - tech-stack agnostic, detects the framework and installs the requested components
argument-hint: [components and/or options, e.g. "button card dialog dark mode" - leave empty for a default init]
---

Install shadcn/ui into the current project. Caller request: $ARGUMENTS

Parse `$ARGUMENTS` yourself before calling the workflow:
- If it names specific components (e.g. `button`, `card`, `dialog`), pull those into a `components` array.
- If it mentions dark mode (`dark mode`, `dark-mode`, `with dark mode`), set `darkMode: true`.
- If it mentions a style (`new-york` or `default`) or a base color (`zinc`, `slate`, `stone`, `gray`, `neutral`), pull those out as `style`/`baseColor`.
- If it says to force/redo/reinitialize, set `force: true`.
- Keep the full original `$ARGUMENTS` text as `request` regardless, so the detector and component engineer have the raw context even if your parsing missed something.

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/shadcn-installer.js`
- `args`: a JSON object literal `{ "request": "$ARGUMENTS", "components": [...], "style": "...", "baseColor": "...", "darkMode": true|false, "force": true|false }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Omit `style`/`baseColor` fields entirely rather than sending empty strings if nothing was specified.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Write the returned `report` field to `docs/setup-notes/shadcn-install.md` (create the folder if it does not exist; overwrite a prior report from this workflow).
2. Summarize for the user: the detected framework/package manager, whether init ran or was skipped, which components installed vs failed, the final verification verdict, and any issue still open after the round cap. If the verdict is `fail`, say so plainly rather than presenting the run as finished cleanly.

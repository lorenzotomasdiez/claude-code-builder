---
description: Turn design-blueprint output (or a product description) into a stack-agnostic design system, plus a component-to-codebase map and the build spec for the isolation gallery page - all written to disk directly by the workflow's own agents
argument-hint: <path to design-blueprint output, or the product description> [| platform] [| brand constraints] [| path to a PRD]
---

Build the design system foundation for this: $ARGUMENTS

The argument may be a path to a directory or file produced by `/design-blueprint` (typically `docs/design/<slug>/`), a path to any design or product document, or a product description.
It may be followed by `|` and a platform target (web, iOS, Android, desktop, responsive web), then optionally another `|` for brand constraints (existing palette, typeface, logo, tone, an existing system to stay compatible with), then optionally a final `|` for a PRD path.

If a PRD path is given, this workflow will pick up whatever `/tech-stack-selector` and `/architecture-designer` already decided (via the PRD's Links row) so the component map is not guessing at a UI library or module boundaries, and it will link the design-system document set back into that PRD. A PRD is optional - without one, everything still runs, just with fewer decisions to cite and no link-back.

Before calling the workflow, if the design argument names a directory, list it so you can pass a path the framer can actually read.

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/design-system-foundation-v2.js`
- `args`: a JSON object literal `{ "design": "<the path or description>", "prd": "<PRD path, or omit/null if none>", "platform": "<the platform target, or 'not stated'>", "brand": "<the brand constraints, or 'none stated'>", "date": "<today's date as YYYY-MM-DD, from your own system context>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Fill in the real current date yourself - it becomes the document set's "Last updated" field.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. The document set is already written to disk at `documentsPath` - do not write it yourself, each document was written directly by the workflow's own `ds2-doc-author` agent. If `prd` was given and `prdLinked` is false, tell the user the automatic PRD link failed and point them at both files.
2. Summarize for the user: the platform target and how many surfaces were framed, how many components were contracted and how many were rejected as unjustified, the resolved `uiLibrary` and how many components were mapped vs left `componentsUnmapped`, the gallery's `galleryLocation`, how many critique rounds ran (`roundsRun`), and any issues still open (`openIssues`) when the round cap was hit - note if `openIssuesTotal` is larger than the `openIssues` list returned (it's capped at 15).
3. Tell the user this set is the frame the developer (or a coding agent) works inside: point `/feature-implementer` and `/tdd-blueprint` at `documentsPath` so UI work consumes these decisions instead of re-inventing them, that `implementation-contract.md` lists the checks `/code-review` should enforce, and that the very first build task - right after the infrastructure scaffold, before any feature - is the page specified in `gallery-plan.md` at `galleryLocation`.

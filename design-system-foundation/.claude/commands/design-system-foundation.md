---
description: Turn design-blueprint output (or a product description) into a stack-agnostic design system - principles, tokens, component contracts, usage rules, and an implementation contract the developer works inside
argument-hint: <path to design-blueprint output, or the product description> [| platform] [| brand constraints]
---

Build the design system foundation for this: $ARGUMENTS

The argument may be a path to a directory or file produced by `/design-blueprint` (typically `docs/design/<slug>/`), a path to any design or product document, or a product description.
It may be followed by `|` and a platform target (web, iOS, Android, desktop, responsive web), and optionally another `|` and brand constraints (existing palette, typeface, logo, tone, an existing system to stay compatible with).

Before calling the workflow, if the argument names a directory, list it so you can pass a path the framer can actually read.

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/design-system-foundation.js`
- `args`: a JSON object literal `{ "design": "<the path or description, everything before the first | >", "platform": "<the platform target, or 'not stated'>", "brand": "<the brand constraints, or 'none stated'>", "date": "<today's date as YYYY-MM-DD, from your own system context>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Fill in the real current date yourself - it becomes the document set's "Last updated" field.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the product (reuse the `design-blueprint` slug if the input came from `docs/design/<slug>/`).
2. Write each entry of the returned `documents` array to `docs/design-system/<slug>/<key>.md` (create the folder if it does not exist), so the set lands as `ux-principles.md`, `design-tokens.md`, `components.md`, `usage-rules.md`, and `implementation-contract.md`.
3. Summarize for the user: the platform target and how many surfaces were framed, how many components were contracted and how many were rejected as unjustified, how many usage rules were settled, any contrast pair reported as failing, any token gap the component authors reported, how many critique rounds ran, and every issue still open when the round cap was hit.
4. Surface the framing's blocking open questions and assumptions explicitly - those are what the team has to answer for the system to be trustworthy.
5. Tell the user this set is the frame the developer works inside: point `/feature-implementer` and `/tdd-blueprint` at `docs/design-system/<slug>/` so UI work consumes these decisions instead of re-inventing them, and note that `implementation-contract.md` lists the checks `/code-review` should enforce.

---
description: Take one request from understanding to three commits on its own branch, refuting every agent claim against the repo
argument-hint: <what you want built>
---

Run the gated SDLC for this request: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/gated-sdlc.js`
- `args`: a JSON object literal `{ "request": "$ARGUMENTS", "runId": "<a short random lowercase id, 6-8 chars, that you generate yourself>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). The `runId` names this run's handoff directory under `.claude/runs/`, so make it unique per invocation.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

Before you call it, know what it does to the repo, because this workflow is not read-only:

- It **refuses to start on a dirty tree**. If `git status` is not clean it returns immediately with the list of uncommitted paths and changes nothing.
- It **creates a branch** and switches to it.
- It **makes up to three commits** on that branch: the plan, the code, the write-up.
- When it finishes, successfully or not, it **leaves you standing on that branch**. It does not switch back.

If the working tree is dirty, say so and stop rather than calling the workflow - the run would only bounce back at you.

When it returns, report in this order:

1. **`accepted`, first and plainly.** If it is `false`, lead with `reason`. A run where the suite never went green or the review never approved is not a success with caveats, and the report must not read like one.
2. **Where the user is now**: `leftYouOn`, and `branchedFrom` for context. They are standing on the run's branch.
3. **What landed**: each entry in `commits` as `sha - message`, and the files it staged.
4. **What did not**: `uncommitted` if it is non-empty, plus `evidence.blocking` when the reviewer blocked.
5. **How it got there**: the `understanding` the framer settled on, the `testCommand` it verified, and the exit code of the last suite run.
6. **Any refuted claim**: if `gates` holds entries with `violations`, name them. A claim the harness could not verify is the single most useful thing in the whole report - it means an agent said something about the repo that was not true.

Do not summarize `phases` line by line unless the user asks. Do not offer to merge, push, or open a PR unless the user asks for that.

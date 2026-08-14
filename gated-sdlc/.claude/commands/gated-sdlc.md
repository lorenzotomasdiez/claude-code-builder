---
description: Take one request from understanding to three commits on its own branch, refuting every agent claim against the repo
argument-hint: <what you want built>
---

Run the gated SDLC for this request: $ARGUMENTS

Before calling the workflow, settle the test command, because the run's whole notion of "verified" is that one string.

**If the user already named one, that is the answer.** Take it as given, do not go looking for a better one, and do not second-guess it. Run it once to confirm it executes, then move on. They know their repo's gate; you are checking it runs, not choosing it.

Only when they did not name one, find it yourself: `package.json` scripts, a `Makefile`, `justfile`, `pyproject.toml`, `Cargo.toml`, whatever this project actually uses. **Run it** to see it work. Then confirm in one line: "I'll verify with `npm test` - correct?" If you cannot find a real suite, say so plainly and ask whether to proceed without one.

Two things to get right when you are the one choosing:

- **A repo with layers usually needs more than one command.** A `Makefile` with separate `backend-test` and `frontend-verify` targets, or a monorepo with a Python service beside a JS app, is not covered by whichever single script you found first. A compound command is fine and expected - `make backend-test && npm test` - and the workflow captures the whole thing, both halves, into one log.
- **Prefer the suite over the full gate.** If the repo has both a fast test target and an everything target that adds e2e, coverage floors and a production build, propose the suite. The run executes this command up to four times, so an expensive choice is expensive four times over. Say what you left out so the user can overrule you.

This step is yours and not an agent's inside the run, on purpose. A command that exists is not a command that tests anything: a `test` script of `echo "no tests" && exit 0` exits 0 forever, and the run would read that as a green suite and report itself accepted having verified nothing. A human settling the command is what closes that hole.

Then call the Workflow tool, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/gated-sdlc.js`
- `args`: a JSON object literal (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted):
  - `request`: `"$ARGUMENTS"`
  - `runId`: a short random lowercase id, 6-8 chars, that you generate yourself. It names this run's handoff directory under `.claude/runs/`, so make it unique per invocation.
  - `testCommand`: the command you just confirmed. Omit it or pass `""` **only** if the user accepted running without a suite - in that case the code will not be committed and the run will report `accepted: false`, which is the intended outcome, not a failure.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

Know what it does to the repo, because this workflow is not read-only:

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
5. **How it got there**: the `understanding` the framer settled on, the `testCommand` the run used, and the exit code of the last suite run. If the suite went red, point at `evidence.testLog` - that file is the real output, not a summary.
6. **Any refuted claim**: if `gates` holds entries with `violations`, name them. A claim the harness could not verify is the single most useful thing in the whole report - it means an agent said something about the repo that was not true.

Do not summarize `phases` line by line unless the user asks. Do not offer to merge, push, or open a PR unless the user asks for that.

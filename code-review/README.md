# Code Review

Multi-lens adversarial review of a diff or PR.
Five independent lenses (correctness, security, performance, tests, readability) review the same diff in parallel, every individual finding is then adversarially re-checked by a verifier that has no stake in being right, and only what survives verification reaches the final ranked report.

This is the flagship pattern from `BACKLOG.md` item 1, built to the same anatomy and quality bar as `prd-generator/` (the canonical template).

## Pipeline

```
Scope (1 agent)
  -> Review (5 agents in parallel: correctness, security, performance, tests, readability)
    -> Verify (1 agent per finding, in parallel, independent of the lens that raised it)
      -> Report (1 agent, ranks and deduplicates surviving findings)
```

The Review and Verify stages are pipelined per lens, not run behind one big barrier: the security lens's findings start verification as soon as security finishes, without waiting for the (potentially slower) readability lens to also finish. Wall-clock time is bounded by the slowest single lens-plus-its-verification chain, not the sum of every stage.

## Why five independent lenses instead of one reviewer

A single reviewer prompted to "check everything" tends to default to whatever lens it happens to favor and skims the rest. Five agents, each restricted to one lens with an explicit "what you do not do" section, cannot skip their assigned concern and cannot bleed into someone else's - the security lens is not allowed to comment on naming, the readability lens is not allowed to flag SQL injection. That separation is enforced by each agent's system prompt, mirroring `prd-critic`'s per-lens design in the template.

## Why verify every finding instead of trusting the lens

Lenses are instructed to be adversarial, which makes them prone to over-flagging (a false "critical" is exactly the failure mode adversarial prompting invites). The `code-review-verifier` agent is spawned once per finding, is blind to which lens raised it, and is explicitly told to try to refute the finding against the real diff - defaulting to `rejected` when it cannot confirm the failure scenario from actual code. This is the "adversarial verify" pattern: it kills plausible-but-wrong findings before they reach the user, the same role the critique loop plays in `prd-generator` but applied per-finding rather than per-document.

## Files

- `.claude/agents/code-review-scoper.md` - orients the lenses: files touched, stack, and risk areas, so five agents do not each re-derive the same context.
- `.claude/agents/code-review-correctness-lens.md` - logic errors, edge cases, error handling, concurrency. Distilled from `experts/software-developer.md`.
- `.claude/agents/code-review-security-lens.md` - injection, auth, secrets, AI/LLM-specific risks (prompt injection, unsafe tool use). Distilled from `experts/pentester.md` and the security sections of `experts/software-developer.md`. Assumes an authorized review context, consistent with `experts/pentester.md`'s framing.
- `.claude/agents/code-review-performance-lens.md` - algorithmic complexity, N+1 queries, scalability under realistic load. Distilled from `experts/software-architect.md` and `experts/software-developer.md`.
- `.claude/agents/code-review-tests-lens.md` - coverage gaps, coverage theater, untested failure paths. Distilled from `experts/qa-architect.md`.
- `.claude/agents/code-review-readability-lens.md` - naming, structure, duplication, dead code. Distilled from `experts/software-developer.md`'s technical soft skills section.
- `.claude/agents/code-review-verifier.md` - the adversarial verifier, spawned once per finding.
- `.claude/agents/code-review-reporter.md` - deduplicates and ranks verified findings into one markdown report.
- `.claude/workflows/code-review.js` - the orchestration script: Scope sequentially, Review/Verify pipelined per lens, Report sequentially.
- `.claude/commands/code-review.md` - the `/code-review [target]` entry point. Resolves the diff (PR, ref range, or working-tree default), calls the workflow, and surfaces the report plus the raw-vs-verified finding counts.

## Usage

```
/code-review
/code-review 142
/code-review main..my-branch
```

With no argument it reviews the working tree's pending diff against the repo's base branch. With a PR number it uses `gh pr diff`. With a ref range it diffs that range directly.

## Smoke test

**Blocked - not yet passing. Documented honestly per the project's Definition of Done, not faked.**

Attempted: invoked `.claude/workflows/code-review.js` directly via the Workflow tool with a trivial synthetic diff (a two-line Python snippet with an intentional SQL injection and a plaintext password comparison, used only to exercise the pipeline, not as a real review target) and `context` describing it as a smoke test.

Result: every attempt failed at the first `agent()` call with:

```
Error: agent({agentType}): agent type 'code-review-scoper' not found.
Available agents: claude, Explore, general-purpose, Plan, statusline-setup
```

This was not specific to this workflow or to nesting. Diagnostic steps taken, in order:

1. Ran the workflow with `scriptPath` pointing at `code-review/.claude/workflows/code-review.js` (its real, nested location) - failed with the error above.
2. Changed the shell's working directory to `code-review/` and re-ran with a relative `scriptPath` - failed identically. The Workflow tool resolved the relative path against the new shell cwd (confirmed by the absolute path echoed back), but agent-type discovery was unaffected - it is not resolved relative to the invoking shell's cwd.
3. Copied the same agent `.md` files and the workflow script to the repo's root `.claude/agents/` and `.claude/workflows/` (simulating what this directory becomes once copied out as its own standalone repo, per the project's "independently copyable" convention) and re-ran - failed identically.
4. To isolate nesting from session-lifecycle caching, directly invoked the Agent tool with `subagent_type: 'prd-clarifier'` - an agent that has existed at `prd-generator/.claude/agents/prd-clarifier.md` since before this session started (it shipped in the repo's initial commit). This also failed with the same "not found" error and the same fixed list of built-in agents.
5. As a final isolation step, placed a copy of `code-review-scoper.md` directly at the repo's root `.claude/agents/` (created mid-session) and invoked it directly via the Agent tool - also failed identically.

Conclusion: the set of available `agentType`s appears to be fixed at session start and is not refreshed by files that are created, moved, or already present on disk once the session is running - this reproduced even for `prd-clarifier`, which predates this session. This looks like a session-lifecycle constraint of the current environment, not a defect in this workflow's structure or file layout. All temporary root-level `.claude/agents` and `.claude/workflows` copies made during diagnosis were deleted; only the real files under `code-review/.claude/` remain.

**Next step for whoever picks this up (a fresh session, e.g. the next iteration after this one is committed):** re-run the exact command in "Usage" above, or re-invoke the Workflow tool at `code-review/.claude/workflows/code-review.js` with the same trivial diff, from a session that starts *after* these files exist on disk. If `code-review-scoper` and friends resolve at that point, this smoke test blocker was purely session-lifecycle and this note can be replaced with a real pass/fail result. If they still do not resolve even in a fresh session, that points at nested (non-root) `.claude/agents/` directories not being discovered at all, which would require either flattening agent discovery to the project root or another fix before any workflow in this repo (including `prd-generator`) can actually run.

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

**Status: PASS.** Recorded here per the project's Definition of Done.

Agent discovery in Claude Code walks **up** from the session's working directory toward the filesystem root - it does not walk **down** into subdirectories. This monorepo's root working directory has no `.claude/agents/` of its own, and `code-review/.claude/agents/` sits *below* that root, so it is never on the discovery path when a session's cwd is the repo root. Each workflow directory is meant to become its own project root once copied out, at which point its `.claude/agents/` *is* the root-scanned directory - so the smoke test must run from a session whose cwd is `code-review/` itself.

**Reproduction and run:** a headless session (`claude -p ... --dangerously-skip-permissions`) was launched with its working directory set to `code-review/`. A direct `Agent` tool call with `subagent_type: 'code-review-scoper'` resolved and ran successfully from that cwd (the same call fails from the monorepo root, confirming the mechanism above). A follow-up headless session, also scoped to `code-review/`, then called the `Workflow` tool directly with `scriptPath: ".claude/workflows/code-review.js"` and a trivial synthetic input:

```json
{"diff": "diff --git a/app.js b/app.js\n... (adds a naive in-memory cache in front of a user lookup query)", "context": "smoke-test diff for the code-review workflow"}
```

**Result:** the full pipeline (scoper -> 5 parallel lenses -> per-finding adversarial verification -> reporter) ran end-to-end and every schema validated.

- `allFindings.length`: 18 (raw findings across all 5 lenses)
- `confirmed.length`: 14 (survived adversarial verification - 4 were rejected as false positives)
- Reporter merged the 14 confirmed findings into 8 deduplicated report entries (3 critical, 2 high, 3 medium), correctly recognizing that several lenses had converged on the same two root defects (cache never populated; inconsistent sync/async return types) and merging them instead of listing duplicates.
- Reporter's overall recommendation (do not merge, due to an unmitigated SQL injection still reachable on cache miss, plus a return-type bug that would crash `.then()` callers) was substantively correct for the injected synthetic diff, confirming the lenses and verifier are not just structurally wired but producing meaningful output.

This confirms both required wiring facts: the command -> workflow -> agents path works, and every structured agent output validated against its schema.

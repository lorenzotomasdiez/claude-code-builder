# workflow-dry-run

A deterministic, no-LLM dry run of a workflow script's own orchestration control flow - the layer of an agentic pipeline that can be exercised without spending a single real `agent()` call, and where a wiring bug otherwise only surfaces the first time an expensive real fan-out hits it.

## Why this exists

Community and Anthropic-adjacent research on testing agentic systems (found via `WebSearch` while building this) converges on a pattern the industry calls "mocked-LLM integration testing": pin a fixed, synthetic verdict per subagent call and use it to test the *orchestration* around the model deterministically - caching, retries, fallbacks, and what happens when a call arrives late or not at all - separately from testing the model's own judgment quality. Microsoft's "Conductor" project (Microsoft Open Source Blog, May 2026) makes the same point from the framework side: the routing/orchestration layer of a multi-agent workflow should be testable at zero token cost, independent of what any individual agent call returns. This repo already has two deterministic, no-LLM checks in the same spirit - `scripts/validate-workflow.mjs` (anatomy) and `schema-lint/` (schema structure) - but neither one actually *executes* a script's control flow. A `parallel()`/`pipeline()` wiring bug, or an unguarded property read on a `null` result, is invisible to both and has so far only ever been found by manual code audit (see `NULL_SAFETY_AFTER_FANOUT.md`) or by a live, expensive smoke-test run.

## What it does

For each workflow package's `.claude/workflows/<name>.js`:

1. Strips the `export const meta = {...}` block (not valid inside a plain `vm` script, and carries no control flow) and runs the remainder of the file - the real script body - in an isolated `vm` context.
2. Mocks every global the Workflow tool injects: `agent()`, `parallel()`, `pipeline()`, `phase()`, `log()`, `workflow()`, `args`, `budget`. `args` is set to a fixed non-empty string, satisfying every workflow's `typeof input === 'string'` normalization branch (the convention `CLAUDE.md` requires) so the dry run gets past the initial input-shape guard and into the real fan-out/phase logic.
3. `agent(prompt, opts)` returns synthetic data shaped directly from the real `opts.schema` literal the call already passes (a `{type:'object', properties: {...}}` walk fills in stub values per field, first `enum` value for enums) - so the mock's shape tracks the workflow's actual contract instead of a hand-maintained fixture that silently drifts from it. **Every 3rd `agent()` call resolves to `null` instead**, simulating a transient subagent failure - the exact behavior the Workflow tool's own contract documents (`agent()` "returns null if the user skips the agent mid-run or the subagent dies on a terminal API error after retries"), and which `parallel()`/`pipeline()` also produce for a failed lane.
4. Runs the whole script once and classifies the result: if it throws `TypeError: Cannot read propert(y|ies) of (null|undefined)`, that's a **FAIL** - a transient failure would crash the run with a generic, undiagnosable error. If it throws any other error (a deliberate guard-and-throw, or the workflow's own input-validation error), that's a **PASS** with the message surfaced as an informational note - the workflow degraded or failed loudly and specifically, which is the correct behavior. If it completes without throwing, that's a plain **PASS**.

```
node workflow-dry-run/workflow-dry-run.mjs <workflow-dir>   dry-run one package
node workflow-dry-run/workflow-dry-run.mjs --all            dry-run every package
```

Exit 0 = every package's control flow survives a simulated fan-out/agent-call failure. Exit 2 = at least one package has an unguarded null read.

## What it does not do

It does not call a real model, does not judge output quality, and does not replace a real end-to-end smoke test - it only proves the script's *own* control flow (phase ordering, fan-out wiring, null-handling) behaves correctly given data shaped like a real response. A schema-conformant stub can still sail through logic that would confuse a human reviewer (e.g. `tech-stack-selector`'s Frame phase explicitly detects and refuses an obvious placeholder-looking string - see the run below - which is the workflow's own defense working as designed, not a dry-run limitation).

## Why not `scripts/`

Same rationale as `schema-lint/` (see its own README, "Why not `scripts/`"): `.claude/settings.json` denies `Edit`/`Write` under `scripts/**` as a deliberate guard rail so no agent can weaken the existing anatomy gate. `workflow-dry-run/` is new, additive tooling in its own directory instead.

## Smoke test (real run against every package, not a synthetic fixture)

`node workflow-dry-run/workflow-dry-run.mjs --all`, first pass, surfaced **3 real, confirmed bugs** - not false positives, all three the same class `NULL_SAFETY_AFTER_FANOUT.md` documents, just not caught by that document's original audit because none of the three involve a `parallel()`/`pipeline()` call site (that audit only checked fan-out result arrays; these are standalone `await agent(...)` calls, which the Workflow tool's own contract says can *also* resolve to `null`):

| Package | Phase | Bug |
|---|---|---|
| `bug-hunter` | Converge | `convergence.rootCause` read with no guard the line after `await agent(...)` |
| `qa-suite-pro` | Implement | `engineering.testsWritten` read with no guard the line after `await agent(...)` |
| `tdd-blueprint` | Sequence | `plan.traceability`/`plan.buildOrder` read with no guard two lines after `await agent(...)` |

All three were fixed with the same guard-and-throw form `dependency-upgrade.js` already established (`if (!x) throw new Error('<Phase> phase failed: ... returned no result (a transient subagent failure) - retry the run.')`) - full detail and the fix diff reasoning in `NULL_SAFETY_AFTER_FANOUT.md`'s new "Extension" section. After the fix, a second `--all` run came back clean:

```
0 package(s) with an unguarded null read under simulated fan-out failure, 17 package(s) dry-run, 0 skipped (no fan-out to exercise).
```

`node scripts/validate-workflow.mjs --all` and `node schema-lint/schema-lint.mjs --all` were re-run after the three edits and both still pass with no new failures (the fixes only add a guard clause on the failure path; they change no schema, no control flow on the success path, and no anatomy).

A deliberate FAIL case was also verified directly against a throwaway fixture package (a standalone `await agent(...)` result read unguarded, positioned so the mock's every-3rd-call failure stride lands on it): the tool correctly reported `FAIL ... unguarded null/undefined read ... Cannot read properties of null (reading 'riskLevel')` and exited 2. The same fixture with a guard clause added came back `PASS`. The fixture was deleted, not committed.

No package in this repo was re-run through a real, expensive end-to-end fan-out for this change - the entire point of this tool is to catch this bug class without spending one.

## How to change this later

Run `workflow-dry-run --all` whenever a workflow script's control flow changes (a new `parallel()`/`pipeline()` call, a new phase reading a fan-out or agent result) as a zero-token regression check, the same way `schema-lint --all` is the zero-token check for schema structure. If a future run wants to extend this tool's coverage: it currently only flags the specific "unguarded null/undefined property read" failure mode; it does not yet check that every `phase()` name declared in `meta.phases` actually gets called, or that a `pipeline()`'s stage count matches its declared shape - both would be straightforward additions to the same harness.

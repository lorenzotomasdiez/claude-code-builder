# Null-safety after parallel()/pipeline() fan-outs

## Why this exists

The Workflow tool's own contract for `parallel()` and `pipeline()` is explicit about partial failure, and it does not fail the way most engineers instinctively guard for.

- `parallel(thunks)`: "A thunk that throws (or whose agent errors) resolves to `null` in the result array - the call itself never rejects, so `.filter(Boolean)` before using the results."
- `pipeline(items, ...stages)`: "A stage that throws drops that item to `null` and skips its remaining stages."
- `agent(...)` itself: "Returns null if the user skips the agent mid-run or the subagent dies on a terminal API error after retries."

A `try`/`catch` around the `await parallel(...)` call catches nothing, because the call itself never rejects - a failed lane surfaces as a `null` sitting quietly in the result array, one slot among otherwise-valid objects. The failure only becomes visible at the next line that reads a property off that slot, and by then the stack trace points at the read, not the actual subagent failure. Community 2026 material on production multi-agent systems converges on the same point from the outside: transient subagent failure (rate limits, terminal API errors) is normal at the scale this repo's workflows fan out to, and a system that crashes the whole run on one lane's failure - instead of degrading to "N of N+1 lenses reported" and continuing - is the recurring reliability gap, not the exception.

## The rule applied

For any `await parallel(...)` or `await pipeline(...)` call whose result feeds a later property access, `JSON.stringify` embedding, `.map` that calls a method/property on each element, or destructuring:

- Chain `.filter(Boolean)` on the result before that first property access, when a missing lane can be safely dropped and the rest of the fan-out should proceed (the common case - review lenses, research lenses, per-item document authors).
- When every lane is required and none can be silently dropped (e.g. two lenses that jointly inform one migration plan, or a destructured fixed-size `parallel([a, b])`), guard explicitly and fail loudly and specifically: `if (!x || !y) throw new Error(...)` naming which lane came back empty, rather than letting a generic `TypeError: Cannot read properties of null` be the only diagnostic.
- `.length`, `JSON.stringify(arr)`, and a `reduce` that already checks `if (!x) return acc` before touching `x`'s properties are all null-safe as written - the rule targets the unguarded property read, not the presence of `null` in the array.

## Repo audit and retrofit proof (this change)

An `Explore` agent read every top-level workflow package's `.claude/workflows/*.js` (17 files, `archive/` excluded per `CLAUDE.md`'s scope) and checked every `await parallel(...)`/`await pipeline(...)` call site - 30 total - for whether a `null` entry in the result array can reach an unguarded property read downstream.

| Outcome | Count |
|---|---|
| Already safely `.filter(Boolean)`-ed inline or within a couple lines | 22 |
| Safe for another reason (explicit guard-and-throw before use, or per-index `arr[i] ? ... : null` guard) | 7 |
| Confirmed unsafe - unguarded property read reachable from a `null` slot | 1 |

The repo's convention is already overwhelmingly sound - 29 of 30 sites already handle this correctly, most by inheriting the `prd-generator` template's `.filter(Boolean)` habit. The one gap: `dependency-upgrade/.claude/workflows/dependency-upgrade.js` destructures a fixed two-lane `parallel([breaking, security])` at line 105 and reads `breaking.riskLevel` / `security.recommendation` / `security.urgency` unguarded two lines later - if either the breaking-change analyst or the security advisor subagent fails transiently, that log line throws `Cannot read properties of null` and the whole upgrade run dies before the migration plan even starts, discarding whichever lane *did* succeed.

Fixed with the guard-and-throw form (both lanes are required here - a migration plan cannot be sequenced from only one of "what breaks" and "what's the security urgency"):

```js
const [breaking, security] = await parallel([...])
if (!breaking || !security) {
  throw new Error(
    `Assess phase failed: ${!breaking ? 'breaking-change analyst' : 'security advisor'} returned no result ` +
    '(subagent error or terminal API failure) - cannot plan a safe migration without both lenses.'
  )
}
log(`Assessment complete: breaking-change risk=${breaking.riskLevel}, security=${security.recommendation} (urgency ${security.urgency})`)
```

This now fails with a message naming which lane failed and why the run cannot continue, instead of a generic `TypeError` several lines away from the actual cause - matching the existing, correct pattern already used at `design-system-foundation-v2.js:609` (`if (!principles || !tokens) throw ...`) for the same fixed-size destructured-`parallel()` shape.

## Smoke test

`node scripts/validate-workflow.mjs dependency-upgrade` passes clean after the edit (anatomy, meta block, and args normalization unaffected - only a guard clause added).

The fix was verified for real, not just read: `node --check` confirms the file still parses, and the guard was exercised directly by running the file's own logic against a fabricated `[null, security]` pair (the exact shape a transient subagent failure produces) - it throws `Assess phase failed: breaking-change analyst returned no result (subagent error or terminal API failure) - cannot plan a safe migration without both lenses.` instead of the prior `TypeError: Cannot read properties of null (reading 'riskLevel')`. A full end-to-end `dependency-upgrade` run (real breaking-change/security-advisor/migration-planner/applier/verifier fan-out) was not re-run for this change: the package already carries its own recorded smoke-test evidence in `dependency-upgrade/README.md` from before this fix, and this change only adds a guard clause on the failure path - it does not alter the success path's control flow, prompts, or schemas, so re-spending a real multi-agent fan-out to re-prove the success path would violate this repo's "never run an expensive fan-out more than once" rule.

## How to change this later

When writing a new `parallel()`/`pipeline()` fan-out, default to `.filter(Boolean)` immediately on the result unless every lane is strictly required, in which case guard-and-throw immediately with a message naming the failed lane(s) - do not let the first unguarded property read downstream become the de facto error handler. This pass audited only the 17 top-level (non-archive) workflow packages that currently use `parallel()`/`pipeline()`; a future run adding a new workflow should apply this rule from the start rather than needing a retrofit.

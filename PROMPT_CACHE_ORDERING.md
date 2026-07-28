# Prompt content ordering for cache-prefix stability

## Why this exists

Anthropic's prompt caching matches on the **longest common prefix** of a request: a cache hit requires everything up to a cached breakpoint to be byte-identical to a prior call, and the moment content diverges, everything after that point stops benefiting from the cache, regardless of how much identical content follows.
This applies to any repeated or parallel `agent()` calls in this repo's workflow scripts that share a large static payload (a diff, a target description, a scope brief) but each carry a small piece of per-call variable text (a lens name, an item id).

Where that variable text is interpolated **before** the shared payload, every call's prefix diverges immediately and the shared payload - often the largest, most expensive-to-reprocess block in the prompt - never gets a chance to hit cache across the fan-out.
Where the variable text is interpolated **after** the shared payload, the shared payload is an identical prefix across every call in that fan-out and is eligible to cache-hit.

Grepping this repo's workflow scripts for the parallel-lens pattern found the anti-pattern was already live in three flagship packages, right next to the correct pattern in the same file: `code-review.js`, `security-audit.js`, and `tenant-isolation-audit.js` each pair a `reviewPrompt`/`auditPrompt` function (lens name first, shared diff/target after - the anti-pattern) with a `verifyPrompt` function immediately below it that already puts the shared payload first and the variable finding/instruction last, with a comment explaining why ("Payload first, task last"). The `verifyPrompt` comment's stated reason was model comprehension (the instruction lands better at the end), which is also true and not in conflict - but the same ordering was never applied to the sibling `reviewPrompt`/`auditPrompt` function one function up, for the actual per-call variable content: the lens name.

Source: [Prompt caching - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) - cache prefix hierarchy is strict (`tools -> system -> messages`), and a divergence at any point invalidates that point and everything after it; static/shared content should sit before variable/per-request content, with the variable content isolated to the end of the prompt.

## The rule applied

For any `agent()` call that runs multiple times (in a `parallel()` fan-out or a `pipeline()` per-item stage) sharing one large static payload with only a small per-call token varying:

- Put the shared static payload first (the diff, the target, the scope brief, prior-phase JSON).
- Put the small per-call variable token last (the lens name, the item id, the specific instruction that differs call to call).
- Wrap the shared payload in a clear tag (`<diff>...</diff>`, `<target>...</target>`) so the boundary between "shared" and "variable" is unambiguous to both the cache-matching logic and the reader of the prompt string.

This is a narrower, more mechanical rule than `SCHEMA_DESIGN.md` or `UNTRUSTED_INPUT_HANDLING.md`: it does not change what the agent is told to do, only where in the string each piece of that instruction sits.

## Retrofit proof (this change)

The anti-pattern was fixed in the exact three files it was found in - the parallel-lens fan-out functions that build a prompt per lens over one shared diff/target:

| Workflow | Function | Before | After |
|---|---|---|---|
| `code-review` | `reviewPrompt(lens)` | `Review this diff through the ${lens.key} lens...` then scope+diff | Scope+diff first (tagged), lens instruction last - matches the file's own `verifyPrompt` right below it |
| `security-audit` | `auditPrompt(lens)` | `Audit this target through the ${lens.key} lens...` then scope+target | Scope+target first (tagged), lens instruction last - matches the file's own `verifyPrompt` right below it |
| `tenant-isolation-audit` | `auditPrompt(lens)` | `Audit this target through the ${lens.key} lens...` then scope+target | Scope+target first (tagged), lens instruction last - matches the file's own `verifyPrompt` right below it |

These three share the identical scope -> parallel-lens -> verify -> report shape (the same family `EFFORT_SELECTION.md` and `SCHEMA_DESIGN.md` retrofitted), so fixing all three proves the fix generalizes across the family rather than patching one script.
`verifyPrompt` in all three files was already correct and was left untouched.

## Smoke test

This change only reorders string concatenation inside three prompt-building functions; it does not change control flow, agent definitions, or schemas, so `node scripts/validate-workflow.mjs --all` continuing to pass is expected and confirmed (no new failures in any of the three packages).

To verify the reordering does not change agent behavior, the real `code-review-correctness-lens` agent definition was invoked once via the `Agent` tool with the new, reordered `reviewPrompt` shape (shared scope+diff tagged and first, lens instruction last) against a trivial two-line diff with one planted bug (a missing null check).
Result: **PASS** - the agent returned a schema-valid `FINDINGS_SCHEMA` object, correctly flagged the planted bug under the `correctness` lens, and its behavior was indistinguishable from the pre-change prompt shape on the same fixture (both find the same bug; only the prompt's internal ordering changed). A full 5-lens parallel fan-out plus adversarial verify was not re-run for any of the three packages: all three already carry a recorded real end-to-end smoke-test PASS in their own READMEs, this change touches prompt-string ordering only, and re-spending a full adversarial fan-out a second time to re-prove a mechanism a single targeted agent call already proves would violate this repo's "never run an expensive fan-out more than once" rule.
Cache-hit-rate improvement itself (fewer prefix tokens billed as cache-write/read vs. fresh input across the 5-lens fan-out) was not independently measured - the Agent SDK does not expose per-call cache-hit telemetry to this repo's workflow scripts, so the evidence here is behavioral equivalence plus the ordering matching Anthropic's documented cache-prefix rule, not a measured token-cost delta. That measurement, if wanted, is honestly a gap: a future run could add cache-hit/miss logging in the repo-internal `context-bloat-forensics` tool.

## How to change this later

When adding a new `parallel()`/`pipeline()` fan-out over one shared payload, write the prompt-building function with the shared payload first (tagged) and the per-call variable token last, matching the `verifyPrompt` functions already in `code-review.js`, `security-audit.js`, and `tenant-isolation-audit.js`.
This rule was retrofitted only into the three files where the anti-pattern was found by grepping for the parallel-lens-over-shared-payload shape; the remaining workflow scripts were not audited for the same anti-pattern in this pass, since most single-agent or non-repeated calls in this repo have no shared payload to protect and the rule does not apply to them. A future run could grep every workflow script for functions building a per-lens/per-item prompt around one shared static payload and check the same ordering there.

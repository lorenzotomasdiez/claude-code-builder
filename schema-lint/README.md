# schema-lint

A deterministic, no-LLM static checker for the JSON Schema literals every workflow script passes to `agent(..., { schema })`.

## Why this exists

Current research on evaluating multi-agent/agentic pipelines converges on one point (Braintrust's agent-evaluation framework, Confident AI's 2026 agent-eval guide, and the "Layer-Isolated Evaluation" arXiv paper on gating a production agent's deterministic scaffold with a no-LLM regression harness, all found via web search for this change): evaluate the deterministic layers of a pipeline with deterministic checks, and reserve LLM judgment (and its cost, latency, and non-determinism) for the layers that actually need it - exact tool names, required parameters, and schema shape don't need an LLM judge.

This repo already has a deterministic gate, `scripts/validate-workflow.mjs`, but it only checks that a schema *reference* resolves (`schema: FOO` -> `const FOO` exists somewhere in the file). It never checks that `FOO` is itself a structurally valid JSON Schema. That gap is real and current: a `required` field with no matching entry in `properties`, or a typo'd `type` value, is invisible to every existing check in this repo and only ever surfaces the first time a live `agent()` call spends real tokens and the SDK rejects the malformed schema - the worst possible point in the pipeline to discover a typo.

A second, already-documented gap compounds this: `SCHEMA_DESIGN.md` (added in a prior run) established the rule that every `enum` field needs a `description` calibrating its values, and named enforcing it in `scripts/validate-workflow.mjs` as the natural next step - but `scripts/**` is deliberately Edit/Write-denied in `.claude/settings.json` so no agent (including the one that tried) can weaken or extend its own quality gate. That prior run left it as "a human-only next step" and stopped there.

## What it checks

Run against every workflow package's `.claude/workflows/<name>.js`:

**FAIL (structural - would break at the SDK):**
- `type` (or any entry in a `type: [...]` array) is not a known JSON Schema type
- an object schema has no `properties`
- a `required` array names a field that is not in `properties`
- an `enum` array is empty

**WARN (the `SCHEMA_DESIGN.md` convention - not yet a hard requirement across the whole library):**
- an `enum` field has no `description`

This is intentionally the same FAIL/WARN split `scripts/validate-workflow.mjs` already uses for "never smoke-tested" - a real, named gap is surfaced without turning every currently-passing package red in one pass.

## Why not `scripts/`

`.claude/settings.json` denies `Edit`/`Write` under `scripts/**` as a deliberate guard rail (confirmed by testing both tools against it while building this). That guard rail exists so no agent can quietly weaken the repo's own quality gate - it is correctly *not* a place this run should route around. `schema-lint/` is new, additive tooling in its own directory instead: nothing in `scripts/validate-workflow.mjs` changed, and a human maintainer can decide later whether to fold `schema-lint.mjs`'s checks into it or keep them separate.

## How it works

Workflow scripts are real JavaScript, not JSON files, so schemas can't just be `JSON.parse`d out - and they reference each other (`FINDINGS_SCHEMA` embeds `FINDING` as `items: FINDING`). `schema-lint.mjs`:

1. Extracts every top-level `const NAME = {...}` / `const NAME = [...]` in the file via real bracket matching (not a `\n}`-shaped regex, which mis-extracts on an inline `{}` or a multi-line string), restricted to `UPPER_SNAKE_CASE` names - this repo's own convention for every schema and schema-fragment const (`BRIEF_SCHEMA`, `FINDING`, `LENSES`, `DOC_TYPES`...). Restricting to that naming convention isn't cosmetic: excluding it caused a real false positive while building this tool (see Smoke test below).
2. For each `schema:` reference an `agent()` call actually uses, resolves the transitive closure of consts it depends on (in dependency-first order, since JS `const` has a temporal dead zone) and evaluates just that closure in an isolated `vm` context - never the whole file, so nothing with side effects (an `agent()`/`parallel()` call, a network request) ever executes.
3. Walks the resulting real JS object and checks the rules above.

## Usage

```
node schema-lint/schema-lint.mjs <workflow-dir>   # lint one package
node schema-lint/schema-lint.mjs --all            # lint every package
```

Exit 0 = no structural errors (warnings may still print). Exit 2 = at least one FAIL.

## Smoke test

**PASS.** Run live against all 31 real workflow packages in this repo (`node schema-lint/schema-lint.mjs --all`), not a synthetic fixture - this tool's whole purpose is auditing the library's actual schemas, so running it for real against them *is* the smoke test.

First real run surfaced 8 false-positive "FAIL"s, all tool bugs rather than real schema bugs, each traced to a concrete cause and fixed before this became the recorded result:
- `type: ['boolean', 'null']` (a valid JSON Schema nullable-type array, used in `shadcn-installer` and `tech-stack-selector`) was rejected because the first version only checked scalar `type` values.
- `client-requirement-shaping`, `design-blueprint`, `technical-solution-proposal`, and `tdd-blueprint` failed to evaluate because the original `\n}`-shaped extraction regex mis-extracted on an inline `const documents = {}` (no internal newline, so the non-greedy match ran on and swallowed unrelated code) - replaced with real bracket matching.
- `design-system-foundation`/`-v2` failed because a schema-adjacent runtime const (`DOC_TYPES`, an array of `{key, title}` used to drive `parallel()`, not a schema) wasn't captured by the original object-only extraction - fixed by also extracting `[...]` literals.
- `prd-generator`/`-v2`, `feature-implementer`, `tdd-blueprint` failed with "`brief`/`blueprint` is not defined": the naive "eval every top-level const together" approach pulled in unrelated *runtime* consts (a `LENSES` array closing over an outer `brief` variable; a `slices` const built from `[...blueprint.slices]`) purely because their text happened to share a bare word with an unrelated schema's property key (`BLUEPRINT_SCHEMA` has a `slices` property; a sibling `const slices = ...` a few lines later is not related to it). Fixed by restricting extraction to `UPPER_SNAKE_CASE` names only, matching this repo's real naming convention, and by resolving only the dependency closure of an actually-used schema root instead of evaluating every const in the file.
- `code-review`, `security-audit`, `perf-investigation`, `qa-suite-pro`, `solid-refactor-hunter`, `spike-research`, `tenant-isolation-audit` failed with "cannot access `FINDING`/`HYPOTHESIS`/... before initialization" - the dependency closure was being emitted in discovery order (root first) instead of dependency-first order, which JS `const`'s temporal dead zone rejects. Fixed with a postorder traversal.

After those fixes, the same live run against all 31 packages came back clean structurally (**0 FAILs**) and found a real, true-positive result: **101 `enum` fields across 27 packages still have no `SCHEMA_DESIGN.md` calibration description** - the exact gap a prior run documented but could not enforce because `scripts/` is edit-denied. This tool makes that gap visible and countable for the first time without spending a single `agent()` call.

A deliberate FAIL case was also verified directly: a throwaway fixture package with a `required: ['verdict', 'missingField']` where `missingField` is not in `properties` was fed to the tool, which correctly reported `FAIL` with the exact missing field named and exited `2`; the fixture was then deleted (not committed - the retained evidence is this paragraph plus the real, permanent 101-warning result against the actual library above).

## What this does not do

It does not (and cannot) check whether a schema's *content* is well-designed for the task - `SCHEMA_DESIGN.md`'s enum-description rule is still a documented convention enforced only as a WARN, not a hard requirement, and this tool cannot judge whether a `description` that exists is actually a good calibration. Retrofitting descriptions into the 101 currently-missing fields, and deciding whether to eventually promote the WARN to a FAIL once that number reaches zero, are the natural next steps - left for a future run per this repo's incremental-retrofit convention (`MODEL_SELECTION.md`, `EFFORT_SELECTION.md`, `SCHEMA_DESIGN.md`, `UNTRUSTED_INPUT_HANDLING.md`, `PROMPT_CACHE_ORDERING.md` were all retrofitted a few files at a time across runs, not all at once).

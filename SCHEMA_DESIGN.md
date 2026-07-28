# Schema field descriptions across workflows

## Why this exists

Every `agent()` call that passes `schema: SOME_SCHEMA` asks the SDK to constrain and validate a subagent's structured output against that JSON Schema.
Anthropic's own current guidance for the Agent SDK's structured-outputs feature is explicit about what a good schema looks like: use `enum` when the valid options are known, and attach a `description` to fields whose meaning is not obvious from the name alone.
It also states the limit of what a schema can do on its own: "structured outputs constrain format, not quality - a poorly prompted agent with a perfect schema will give you valid JSON containing wrong answers."

An `enum` field is exactly the place that guidance matters most. A schema can force a subagent's output into one of a fixed set of tokens, but it cannot force the subagent to have picked the *right* token unless the token's meaning is unambiguous. `severity: enum ['critical', 'high', 'medium', 'low']` and `verdict: enum ['confirmed', 'rejected']` are two of the most consequential fields in this repo - they drive what gets shown to a human as urgent and what a verification loop discards as a false positive - and grepping every `.claude/workflows/*.js` script in the repo for `enum:` (109 hits across 30 files) turned up zero adjacent `description:` fields explaining the calibration behind any of them. Every subagent asked to fill in a `severity` or `verdict` field was left to infer the boundary between adjacent values on its own, with no anchor in the schema itself.

## The rule applied

Any schema field with an `enum` gets a `description` in the same object literal, stating the calibration criterion for choosing between the listed values - not just what the values are (the `enum` array already says that), but what distinguishes them. Free-text `string` fields whose name is self-explanatory (`summary`, `reasoning`, `path`) do not need one; the cost of a description is prompt-context weight, so it should be spent where a subagent could otherwise plausibly guess wrong, which is precisely the enum case.

`scripts/validate-workflow.mjs` is the repo's own gate for the quality bar in `CLAUDE.md`, and it is deliberately protected: `.claude/settings.json` denies `Edit` on `scripts/**` (also `experts/**` and `prd-generator/.claude/**`), so no agent working inside this repo, including the one that wrote this document, can weaken or extend that gate itself. That is a correct guard rail, not a gap to work around, so this convention is enforced the same way `MODEL_SELECTION.md`'s model tiering and `EFFORT_SELECTION.md`'s effort tiering already are: documented here, retrofitted into real workflows to prove it, and left as a convention a human maintainer can promote into `scripts/validate-workflow.mjs` later if they choose to.

## Retrofit proof (this change)

Descriptions were added to the enum fields in two real, currently-used schemas to prove the pattern, not just propose it:

| Workflow | Schema / field | Description added |
|---|---|---|
| `code-review` | `FINDINGS_SCHEMA.severity` | Calibration for critical vs. high vs. medium vs. low, tied to blast radius and exploitability, not gut feel |
| `code-review` | `VERDICT_SCHEMA.verdict` | What must be true of the diff itself (not the finding's phrasing) to confirm vs. reject |
| `security-audit` | `FINDINGS_SCHEMA.severity` | Same shape as `code-review`, tied to exploitability and data exposure |
| `security-audit` | `VERDICT_SCHEMA.verdict` | Same shape as `code-review` |
| `context-bloat-forensics` (repo-internal tool) | `DISCOVERY_SCHEMA.files[].kind`, `TIMELINE_SCHEMA.readMode`, `TIMELINE_SCHEMA.events[].type`, `CRITIQUE_SCHEMA.findings[].severity` | Distinguishes file kinds, when sampling vs. a full read is the correct mode, the event taxonomy, and severity calibration for bloat findings |

`code-review` and `security-audit` were chosen because they share the exact `Scope -> lenses -> Verify -> Report` shape already used as the retrofit proof in `EFFORT_SELECTION.md`, so the same fix proves it generalizes across a workflow family, not one script. `context-bloat-forensics` was chosen because it is the one workflow this repo can smoke-test end to end without spending a real cross-team fan-out.

## Smoke test

`context-bloat-forensics` was invoked live via the Workflow tool against a fresh trivial fixture folder (`/tmp/cbf-smoke-test-2/journal.jsonl`, a single fake JSON line) after adding `description` fields to its four enum properties.
Result: **PASS** - see `reports/context-bloat-forensics/README.md` for the run record. Discover -> Narrate -> Critique -> Synthesize completed in order, every schema (now carrying the new `description` fields) validated with no SDK rejection or retry, and the enum outputs the subagents chose (`kind`, `readMode`, event `type`, `severity`) matched the descriptions' calibration criteria.

`code-review` and `security-audit` were not re-run end to end for this change: `node scripts/validate-workflow.mjs --all` continues to pass for both, and adding a `description` string to an existing schema field changes no control flow, no required fields, and no enum values - the live `context-bloat-forensics` run already proves the SDK accepts schemas shaped this way. Re-spending a full adversarial fan-out on both a second time to re-prove a mechanism the live run already proved would violate this repo's own "never run an expensive fan-out more than once" rule.

## Remaining gap

28 of the 30 workflow packages that use `enum` schema fields (every one except the three retrofitted here) still have zero `description` fields on those enums. This is the explicit next step for a future run, worked through package by package the way `MODEL_SELECTION.md`'s model tiering and `EFFORT_SELECTION.md`'s effort tiering were both retrofitted incrementally over multiple runs rather than in one pass - and, unlike those two, a human maintainer (not an agent, since `scripts/**` is edit-denied) is the one who would need to turn this from a documented convention into a `validate-workflow.mjs` check if that enforcement is wanted.

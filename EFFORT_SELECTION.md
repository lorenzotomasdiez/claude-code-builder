# Reasoning-effort selection across workflows

## Why this exists

Every `agent()` call inside a workflow's orchestration script can set `opts.effort` to `'low' | 'medium' | 'high' | 'xhigh' | 'max'`.
This is a separate lever from `opts.model` (documented in `MODEL_SELECTION.md`): model picks which model runs the call, effort picks how large a reasoning/thinking budget that model spends before it acts.
Until this change, effort was not used anywhere in the 32 workflow scripts in this repo (one unrelated hit for a schema field literally named `effort`, in `feedback-triage`, does not count).
Every agent call inherited the session's default effort, regardless of whether that step was a mechanical file listing or an adversarial verification meant to kill a false positive.

That is the same missed distinction `MODEL_SELECTION.md` already documented for model choice, one lever over. Community and Anthropic guidance on the Claude Agent SDK's per-subagent configuration surface makes the same point about effort specifically: many subagent tasks are mechanical (extraction, formatting, enumerating files) and do not benefit from a deep reasoning budget, but pay its latency and token cost by default; conversely, the judgment-heavy phases this repo already pins to `model: 'opus'` (adversarial verification, synthesis, cross-examination) are exactly the phases a wider reasoning budget helps most.

## The rule applied

For each phase, ask what kind of work it does, not what model it uses - model and effort are independent decisions that happen to correlate:

- **Mechanical / extraction phases** (enumerate files, list touched files and risk areas, scope a target without judging it) get `effort: 'low'`. These phases produce a structured inventory, not a decision; a large thinking budget spent here is pure cost with no quality gain.
- **Breadth phases** (parallel lenses reading a diff or target and reporting what they see, drafting, implementing) stay on the session default - no override. This mirrors `MODEL_SELECTION.md`'s Sonnet default: correct as the unmarked case, not an oversight.
- **Judgment phases** (adversarial verification that has to actually refute a claim against real code, final synthesis that resolves conflicting findings) get a raised effort (`'high'` or `'xhigh'`), applied alongside `model: 'opus'` where that phase already carries it. The two levers stack: opus for reasoning quality, higher effort for how hard it works before answering.

The unit that carries the effort choice is the phase, exactly as `MODEL_SELECTION.md` argues for model: a single workflow legitimately needs low effort at its scoping step and high effort at its verification step, and picking one effort level for an entire workflow either overpays for the mechanical steps or underpowers the judgment step.

## Retrofit proof (this change)

Effort was retrofitted into three real scripts to prove the pattern works, not just documented as an idea:

| Workflow | Phase | Effort | Why |
|---|---|---|---|
| `context-bloat-forensics` (repo-internal tool) | Discover | `low` | Bash-only file enumeration with size metadata - no judgment, deliberately never reads content |
| `context-bloat-forensics` (repo-internal tool) | Synthesize | `high` | The one barrier phase: dedupes findings across every audited file into one coherent report |
| `code-review` | Scope | `low` | Lists touched files and flags risk areas for the lenses to pick up - an inventory, not a verdict |
| `code-review` | Verify (per finding) | `xhigh` | Already `model: 'opus'` - has to actually refute a finding against the real diff, not just restate it |
| `security-audit` | Scope | `low` | Same shape as `code-review`'s Scope |
| `security-audit` | Verify (per finding) | `xhigh` | Same shape as `code-review`'s Verify |

`code-review` and `security-audit` share the same scope/lens/verify/report shape, so both moved together as one proof that the pattern generalizes across a workflow family, not just one script.

## Smoke test

`context-bloat-forensics` was invoked live against a trivial one-line fixture folder (`/tmp/cbf-smoke-test/journal.jsonl`, a single fake JSON line) after adding `effort: 'low'` to Discover and `effort: 'high'` to Synthesize.
Result: **PASS** - see `reports/context-bloat-forensics/README.md`'s smoke-test log for the run record. The workflow completed Discover -> Narrate -> Critique -> Synthesize with the new `effort` values accepted by the `agent()` call and no schema or wiring failures; `node scripts/validate-workflow.mjs --all` continues to pass for every retrofitted package (`code-review`, `security-audit` both still `PASS`).
`code-review` and `security-audit` were not re-run end to end for this change: both already carry a recorded real smoke-test PASS in their own READMEs from before this retrofit, and adding an `opts.effort` value to an existing `agent()` call does not change control flow, schemas, or agent definitions - anatomy validation plus the live `context-bloat-forensics` run is the evidence that the mechanism itself (the SDK accepting and applying `opts.effort`) works; re-spending a full adversarial fan-out on both flagship workflows a second time to prove that one already-proven mechanism also holds there would violate this repo's "never run an expensive fan-out more than once" rule for no new information.

## How to change this later

Each override sits on the `opts` object of the relevant `agent()` call, e.g. `{ agentType: '...', schema: ..., effort: 'low' }`. To revisit a decision, search a workflow's script for `effort:` and change or remove it there. When a phase already carries `model: 'opus'` for judgment reasons, treat effort as the accompanying decision, not a separate one - if the phase is opus because it is a judgment call, it is very likely also a `high`/`xhigh` effort call for the same reason.

Phases not covered by the retrofit above (every fan-out lens, every drafting/authoring/implementing phase, every reporter) were deliberately left on the session default, matching `MODEL_SELECTION.md`'s Sonnet-default reasoning: no override is correct there, not an oversight. Applying `effort: 'low'` to every scoping/discovery/mapping phase across the remaining 29 workflow scripts, and `effort: 'high'`/`'xhigh'` to every phase already pinned to `model: 'opus'`, is the natural next step for a future run - listed in `BACKLOG.md`'s builder notes.

# Model selection across workflows

## Why this exists

Every `agent()` call inside a workflow's orchestration script (`.claude/workflows/<name>.js`) can pin a model via `opts.model`.
Until now, none of the 21 workflows in this repo did.
Every agent call inherited whatever model the session happened to be running under, regardless of whether that step was a cheap parallel finding pass or a high-stakes synthesis decision.

That's a missed distinction. Anthropic's own guidance (and the pattern that has become standard practice for agentic workflows) is:

- **Sonnet** handles the large majority of coding, QA, and execution work well, and is meaningfully faster and cheaper. It is the right default for breadth work: parallel fan-out lenses, drafting, implementing, running tests, gathering evidence.
- **Opus** earns its cost specifically for complex reasoning: cross-examining conflicting proposals, adversarially verifying findings, resolving disagreement into one decision, and architecture-level judgment calls.

The unit that should carry a model choice is the **phase**, not the workflow.
A single workflow often needs both: Sonnet for the fan-out/finding stage, Opus for the judgment/synthesis stage that follows it.
Picking one model for an entire workflow either overpays for the breadth stages or underpowers the judgment stage.

## The rule applied

For each workflow, every phase that is genuinely a judgment call - convergence, adversarial verification, panel-debate cross-examination, or final synthesis that resolves disagreement - gets `model: 'opus'` on its `agent()` call(s). Everything else (scoping, parallel lenses, drafting, implementing, running tests, evidence-gathering) stays on the session default (Sonnet in normal use), since no override is the correct choice there, not an oversight.

Four workflows are architecture/panel-debate workflows almost end to end (`architecture-designer`, `technical-solution-proposal`, `design-blueprint`, `client-requirement-shaping`) - their entire point is high-stakes cross-examination and judgment, so most or all of their phases carry the override.

## Workflow-by-workflow outcome

| Workflow | Opus phases | Rationale |
|---|---|---|
| `code-review` | Verify | Adversarial verification is the false-positive-killing judgment step |
| `security-audit` | Verify | Same shape as code-review |
| `bug-hunter` | Converge | Picking the one real root cause from competing hypotheses is the judgment call |
| `perf-investigation` | Report | Ranking issues by impact and proposing fixes is synthesis, not lookup |
| `epic-breakdown` | Sequence & Estimate | Cross-epic sequencing/risk judgment, not per-epic drafting |
| `release-readiness` | Report | The go/no-go verdict is the entire point of the workflow |
| `spike-research` | Synthesize | Final recommendation with a stated confidence level |
| `technical-solution-proposal` | Propose, Debate, Synthesize | Whole-workflow panel debate; Scope stays Sonnet |
| `design-blueprint` | Propose, Debate, Synthesize | Whole-workflow panel debate; Frame and Author stay Sonnet |
| `client-requirement-shaping` | Propose, Debate, Challenge, Synthesize | 8-seat panel plus two outside judges; Intake, Research, Author stay Sonnet |
| `architecture-designer` | Clarify, Draft, Critique, Revise | Architecture-level judgment runs through the whole pipeline |
| `prd-generator` | Critique | Adversarial quality-checklist review, same pattern as code-review's Verify |
| `feature-implementer`, `bug-hunter` (other phases), `test-backfill`, `dependency-upgrade`, `docs-sync`, `status-report`, `feedback-triage`, `qa-suite`, `qa-suite-pro`, `qa-suite-pro-computer-use` | none | Breadth/execution work throughout - Sonnet default is already correct, no override needed |

## How to change this later

Each override sits on the `opts` object of the relevant `agent()` call, e.g. `{ agentType: '...', schema: ..., model: 'opus' }`, and the corresponding `meta.phases` entry is annotated `(opus: ...)` so the reasoning is visible from the phase list alone. To revisit a decision, search a workflow's script for `model: 'opus'` and change or remove it there - no other file needs to change.

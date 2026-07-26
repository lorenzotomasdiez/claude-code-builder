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
| `tdd-blueprint` | Strategy, Critique, Sequence | Suite architecture, adversarial spec-set review, and red-green ordering are the judgment calls; Frame, Specify, Revise, and Author stay Sonnet |
| `feature-implementer`, `bug-hunter` (other phases), `test-backfill`, `dependency-upgrade`, `docs-sync`, `status-report`, `feedback-triage`, `qa-suite`, `qa-suite-pro`, `qa-suite-pro-computer-use` | none | Breadth/execution work throughout - Sonnet default is already correct, no override needed |

## Writing prompts for the Opus phases

Picking Opus for a phase is only half the decision.
Opus 5 behaves differently enough from earlier models that a prompt tuned for Sonnet leaves quality on the table, and in one case actively loses recall.
The 33 agent definitions invoked with `model: 'opus'` follow the conventions below; apply them to any new Opus phase.

**Frontmatter matches the pin.** Every Opus-pinned agent declares `model: opus` in its own frontmatter, not `model: sonnet`.
The `opts.model` override and the agent definition previously disagreed on all 33 files, which made the whole model-selection decision depend on an undocumented precedence rule.
They now agree, so the phase runs on Opus regardless of which one wins.

**No "only report significant issues" bar in a review phase.** This is the one change that fixes a real quality loss rather than trimming cost.
Opus 5 follows a stated reporting bar literally: it does the same thorough review, finds the same problems, then declines to report the ones below the bar, so precision rises and measured recall falls.
`prd-critic` and `architecture-critic` now list every checklist item that fails, including small and uncertain ones, and the `ready`/`needs_revision` verdict does the filtering afterwards from a concrete rule ("would this change what someone builds?") rather than from the critic's private sense of importance.

**Length is prompted, never assumed.** Opus 5 writes longer than prior models by default, and effort does not shorten visible output.
Document producers (`architecture-writer`, the synthesizers, the reporters) carry a "Length and scope of the document" section: write the sections the structure calls for and nothing beyond them, match each section's length to its substance, and give a thin section a short honest entry that names the gap rather than padding it.
Structured-output agents carry the field-level equivalent.
Panel seats and verifiers carry the argument-level equivalent, since an inflated debate round costs every downstream seat that has to read it.

**Scope is stated explicitly.** Opus 5 will widen a task it judges under-specified.
Every Opus agent now says what it decides at and what it leaves alone: verifiers judge the one finding they were handed and drop anything unrelated they notice on the way, panel seats stay inside their lens and challenge rather than redesign, outside voices judge the converged position rather than proposing a product, synthesizers add no late position nobody got to challenge.

**Self-correction is bounded.** Opus 5 narrates its own corrections more than prior models, which in a multi-round debate reads as a seat relitigating itself.
Panel seats concede in one sentence, then leave settled points and their own unchallenged reasoning alone.

**Payload first, task last.** The Opus calls carrying a large payload (a full diff, an audit target, a document draft, a multi-round debate transcript) now put that payload in delimited blocks at the top of the prompt and the instruction at the bottom.
An instruction buried above a long payload performs worse than the same instruction at the end.

**No verification or delegation scaffolding.** Do not add "double-check your work" or "verify before responding" to an Opus phase: it compounds with behavior the model already performs and buys tokens rather than quality.
Concrete verification is fine and is exactly what the verifier agents do - it is the generic self-check instruction that hurts.
Likewise, do not tell an Opus agent to delegate; the orchestration script owns fan-out, and Opus 5 over-reaches for subagents when encouraged.

## How to change this later

Each override sits on the `opts` object of the relevant `agent()` call, e.g. `{ agentType: '...', schema: ..., model: 'opus' }`, and the corresponding `meta.phases` entry is annotated `(opus: ...)` so the reasoning is visible from the phase list alone. To revisit a decision, search a workflow's script for `model: 'opus'` and change or remove it there - and update that agent's frontmatter `model:` to match, so the two do not drift apart again.

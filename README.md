# Claude Code Builder

A library of reusable Claude Code workflows that take a product from idea to shipped PR - and keep it healthy afterward.
Each workflow is a self-contained, runnable package: a slash command, an orchestration script, and a set of narrow subagents that do one recurring product or engineering task well, instead of one agent trying to do everything.

Two ways to use this repo:

- **Run the greenfield pipeline** on a new product idea, end to end, from PRD to a QA'd, merged feature.
- **Drop in one flagship workflow** - a code review, a bug hunt, a security audit - into any existing project, on its own.

See `BACKLOG.md` for the full catalog and rationale behind every workflow ever built here, `STATUS.md` for the honest per-package run history, and `CLAUDE.md` for the anatomy and quality bar every workflow follows.

## Quick start

```
# Drop a flagship workflow into whatever you're working on:
/code-review                        # multi-lens adversarial review of your current diff
/bug-hunter <bug description>        # reproduce, root-cause, fix, and prove the regression test
/security-audit <target>            # OWASP + AI/LLM lenses, every finding independently verified

# Or run the full greenfield pipeline on a new idea:
/prd-generator-v2 <idea>
```

Each package under this repo's root is copyable on its own - copy its directory into another project's `.claude/` layout and the slash command works there too. No cross-workflow imports, no shared runtime.

## The flagship workflows

These 17 packages are this library's best, most-trusted work: either a real end-to-end smoke test is recorded with nothing open since (**Solid**), or the package is load-bearing infrastructure for the greenfield pipeline below and under active maintenance. Everything else that's been built - superseded v1s, standalone packages with an open caveat or no run yet - lives in `archive/`, fully working and fully documented, just not in this set. See `STATUS.md` for what "Solid" requires and the exact state of every package, including these 17.

| Workflow | What it does |
|---|---|
| `code-review` | Five parallel lenses (correctness, security, performance, tests, readability) review a diff; every finding adversarially verified before ranking. |
| `bug-hunter` | Reproduces a bug for real, fans out root-cause hypotheses in parallel, converges, fixes it, and proves the regression test via a mutation check. |
| `test-backfill` | Finds the highest-risk under-tested code and backfills tests proven, via mutation check, to actually catch a regression. |
| `dependency-upgrade` | Assesses a version bump across three parallel lenses, applies it, and loops apply/verify against the real build and test suite. |
| `security-audit` | OWASP + AI/LLM parallel attack-surface lenses over a diff or service; every finding independently verified. |
| `perf-investigation` | Five parallel hotspot hypotheses (algorithmic, I/O, concurrency, memory, infra) gather evidence independently, synthesized into a ranked report. |
| `tenant-isolation-audit` | Four parallel lenses (data-layer, authz/session, background-jobs, integrations/AI-context) audit a multi-tenant SaaS target for cross-tenant leaks. |
| `technical-solution-proposal` | Six expert seats propose independently, cross-examine each other over capped rounds, and a synthesizer resolves what it can. |
| `spike-research` | Four independent research lenses, adversarially fact-checked, synthesized into an options matrix with a stated confidence level. |
| `prd-generator-v2` | Idea -> PRD, first link in the greenfield pipeline. |
| `tech-stack-selector` | PRD -> researched, weighted tech-stack decision matrix. |
| `architecture-designer` | PRD -> architecture characteristics, component design, ADRs. |
| `design-system-foundation-v2` | PRD/design -> stack-agnostic design system: tokens, component contracts, usage rules, gallery plan. |
| `task-breakdown` | PRD -> sequenced, appendable task list (infra -> toolchain -> gallery -> product tasks). |
| `tdd-blueprint` | One task -> Given/When/Then spec set a developer does TDD from, no code written. |
| `feature-implementer` | One task -> implemented slice, tests, self-review, PR body. |
| `qa-suite-pro` | One task -> layered test strategy plus a real browser E2E pass, headless or headed. |

## The greenfield pipeline

8 of the 17 flagships above are designed to run together, in this order, on one product - each one writes its document(s) to disk and references the ones before it instead of duplicating their content:

```
/prd-generator-v2 <idea>
  -> docs/product-specs/<slug>-prd.md

/tech-stack-selector <PRD path>
  -> docs/product-specs/<slug>-tech-stack.md          (links itself into the PRD's header)

/architecture-designer <PRD path>
  -> docs/product-specs/<slug>-architecture.md         (links itself into the PRD's header)

/design-system-foundation-v2 <design or idea> | <PRD path>
  -> docs/design-system/<slug>/ (7 documents)          (links itself into the PRD's header)

/task-breakdown <PRD path>
  -> docs/tasks/<slug>/tasks.md                        (T0 infra -> T1 toolchain -> T2 design-system gallery -> product tasks)

# per task, repeat:
/tdd-blueprint <tasks.md> | <task ID>
  -> docs/testing/<slug>/<task ID>/

/feature-implementer <tasks.md> | <task ID>
  -> implements the slice, marks the task done in tasks.md when nothing is blocked

/qa-suite-pro <tasks.md> | <task ID> [headed]
  -> docs/qa-reports/<slug>/<task ID>/
```

Only the PRD path is ever needed to start the chain - `tech-stack-selector`, `architecture-designer`, and `design-system-foundation-v2` each make one targeted edit to the PRD's own Links row, so every step after them resolves the rest automatically. Per-task steps only need `<tasks.md> | <task ID>` - the task's own `References` row does the rest.

To add requirements to a product that already has tasks, re-run `/task-breakdown <PRD path> | <existing tasks.md>` - it only ever appends new rows, never touches existing ones.

**These 8 workflows are the only ones in the library updated to this hub-and-spoke, reference-not-duplicate convention** (write-to-disk-and-return-status, read-by-path critique/revise, one call owns any shared-document edit, and - for the last three - a `<tasks.md> | <task ID>` scoped-invocation mode). The other 9 flagships (`code-review`, `bug-hunter`, `test-backfill`, `dependency-upgrade`, `security-audit`, `perf-investigation`, `tenant-isolation-audit`, `technical-solution-proposal`, `spike-research`) are standalone, run-anywhere packages, not part of this document chain.

## Orchestration patterns demonstrated

Each pattern below is a deliberate choice for a specific problem shape, not a default applied everywhere. Every pattern names the workflow(s) that actually use it - none of this is aspirational.

- **Parallel lenses.** Independent reviewers, each blind to the others, looking at the same input for different failure modes. `code-review` runs correctness/security/performance/tests/readability at once; `perf-investigation` runs five hotspot hypotheses (algorithmic, I/O, concurrency, memory, infra) the same way. The point is that a single reviewer anchors on whatever they notice first - five independent ones don't share that blind spot.
- **Adversarial verify.** A finding is not real until something independent tries to kill it. `bug-hunter` and `test-backfill` go further than a re-reviewer: they require a mutation check - deliberately break the code the new test claims to cover and confirm the test actually fails - proof a test enforces behavior instead of just running green. `security-audit`'s verifier refuses to confirm a finding it cannot locate in real code, which is why its one smoke test correctly shows all 10 raw findings rejected against a fictitious target - that's the verifier doing its job, not the workflow failing.
- **Critique/revise, capped.** A reviewer flags issues, an author fixes only the flagged ones, and the loop repeats up to a fixed round limit - then stops and returns the best draft with what's still open, rather than looping forever chasing a clean pass. Several archived packages' own smoke tests hit this cap with something still open, and shipped that gap as a visible note instead of hiding it - that honesty is the point of the pattern, not a failure of it.
- **Panel debate / cross-examination.** Distinct from parallel lenses: here the seats see and respond to each other's proposals over capped rounds before a synthesizer resolves what it can and records what stays genuinely disagreed. `technical-solution-proposal` (6 expert seats) uses this where independent lenses would miss the disagreement itself.
- **Pipeline over parallel-with-a-barrier.** Most multi-stage workflows run each item through every stage independently rather than waiting for every item to finish one stage before any starts the next - wall-clock is the slowest single chain, not the sum of slowest-per-stage. Used as the default across the library; a real barrier is reserved for the few places that genuinely need every result at once (e.g. a critique round needing every lens's verdict before deciding whether to revise at all).
- **Hub-and-spoke, reference not duplicate.** The 8-workflow greenfield pipeline above is the clearest example: each document links back to the one before it with one minimal targeted edit, and every downstream step resolves the rest of the chain from that link - nothing is ever pasted twice. `code-review` uses the same read-by-path discipline for evidence it cites.
- **Write-to-disk-return-status.** A document-writing agent gets `Write`/`Edit` tools, writes the real file itself, and returns only `{path, charCount, version}` - never the document text - so it's never re-embedded into a downstream prompt a second time. Applied across the greenfield pipeline's doc authors after a real audited run showed the alternative (returning full text, then re-pasting it back in) was the single largest source of wasted context in this library. See `reports/context-bloat-forensics/`.
- **Task-scoped invocation.** `tdd-blueprint`, `feature-implementer`, and `qa-suite-pro` each accept `<tasks.md path> | <task ID>` as an alternative to a whole free-text target - the framer/scoper reads exactly one row plus the documents it references, instead of the whole product's documentation, to do one task's worth of work.
- **Model tiering.** Judgment/synthesis phases (convergence, adversarial verification, cross-examination resolution) get `model: 'opus'`; execution/breadth phases (scoping, drafting, running tests, gathering evidence) stay on the session default. See `MODEL_SELECTION.md` for the full rationale and the workflow-by-workflow table.
- **Effort tiering.** The same per-phase logic applies to reasoning-effort budget, a separate lever from model choice: mechanical scoping/discovery phases get `effort: 'low'`, judgment phases already pinned to `model: 'opus'` also get `effort: 'high'`/`'xhigh'`, and breadth phases stay on the session default. See `EFFORT_SELECTION.md` for the rationale and the retrofit proof (`context-bloat-forensics`, `code-review`, `security-audit`).

## Archive

`archive/` holds every other workflow this library has built: fully anatomy-clean and runnable, just not in the flagship set above - either superseded by a v2 in the same family (`prd-generator` -> `prd-generator-v2`, `design-system-foundation` -> `design-system-foundation-v2`), or a standalone package with a real open caveat or no recorded run yet. Nothing there was deleted; every package keeps its own README, its git history, and a documented path back to the root once someone runs its smoke test. See `archive/README.md` for the full list and reasoning, and `STATUS.md` for per-package state.

## Auditing the library's own context usage

`context-bloat-forensics` (repo-internal, not part of the installable catalog) is a workflow that audits real transcripts of these workflows running, for the specific failure mode of context bloat: oversized inputs, content duplicated instead of referenced, unbounded loops, self-reported values nobody actually measured. Every real fix documented in `STATUS.md` and in individual packages' READMEs (write-to-disk-return-status, read-by-path critique, measured-not-estimated `charCount`, per-document context scoping) traces back to a finding this tool surfaced against a real run - see `reports/context-bloat-forensics/` for the evidence. Treating "does this workflow waste context" as its own auditable, fixable thing - not just "does it work" - is deliberate.

`schema-lint` (repo-internal, not part of the installable catalog) is a deterministic, no-LLM checker for the JSON Schema literals every workflow passes to `agent(..., { schema })` - the layer of an agentic pipeline current eval-pipeline research says should be checked without spending an `agent()` call at all. `node schema-lint/schema-lint.mjs --all` catches structural schema bugs (a `required` field missing from `properties`, an unknown `type`) before they ever reach a live SDK call, and enforces the `SCHEMA_DESIGN.md` enum-description convention as a WARN - the enforcement step a prior run documented as needed but couldn't build itself, since `scripts/` (where the existing anatomy gate lives) is deliberately edit-denied to agents. See `schema-lint/README.md` for the real run against all 31 packages, including the false positives it initially produced and how each was fixed.

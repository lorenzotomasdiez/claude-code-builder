# claude-workflows

A library of reusable Claude Code workflows for building and maintaining products from scratch.
Each workflow is a self-contained, runnable package that orchestrates specialized subagents to do one recurring product or engineering task.
See `BACKLOG.md` for the full catalog and rationale behind every workflow, and `CLAUDE.md` for the required anatomy and quality bar every one of them follows.

## Status

31 workflow packages. **8 solid** (a real end-to-end run recorded, nothing open since), **11 need review** (working, with a specific named caveat - usually a fix that landed after the last real run), **12 never verified** (wiring-clean, no real run yet, usually for a stated reason: needs a live browser, needs a real repo to push branches against).

See `STATUS.md` for the full per-package table and what "solid" actually requires. Nothing here is rounded up - a workflow with correct orchestration and one unverified fix is marked "needs review," not "solid," because the caveat is the information that matters.

## The greenfield pipeline

These 8 workflows are designed to run together, in this order, on one product - each one writes its document(s) to disk and references the ones before it instead of duplicating their content:

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

**These 8 workflows are the only ones in the library updated to this hub-and-spoke, reference-not-duplicate convention** (write-to-disk-and-return-status, read-by-path critique/revise, one call owns any shared-document edit, and - for the last three - a `<tasks.md> | <task ID>` scoped-invocation mode). Every other workflow in `BACKLOG.md` is still a standalone package: correct on its own, but not wired into this chain and not yet audited for the same context-bloat patterns. Treat that as open follow-up work, not as parity with the group above.

## Orchestration patterns demonstrated

Each pattern below is a deliberate choice for a specific problem shape, not a default applied everywhere. Every pattern names the workflow(s) that actually use it - none of this is aspirational.

- **Parallel lenses.** Independent reviewers, each blind to the others, looking at the same input for different failure modes. `code-review` runs correctness/security/performance/tests/readability at once; `perf-investigation` runs five hotspot hypotheses (algorithmic, I/O, concurrency, memory, infra) the same way. The point is that a single reviewer anchors on whatever they notice first - five independent ones don't share that blind spot.
- **Adversarial verify.** A finding is not real until something independent tries to kill it. `bug-hunter` and `test-backfill` go further than a re-reviewer: they require a mutation check - deliberately break the code the new test claims to cover and confirm the test actually fails - proof a test enforces behavior instead of just running green. `security-audit`'s verifier refuses to confirm a finding it cannot locate in real code, which is why its one smoke test correctly shows all 10 raw findings rejected against a fictitious target - that's the verifier doing its job, not the workflow failing.
- **Critique/revise, capped.** A reviewer flags issues, an author fixes only the flagged ones, and the loop repeats up to a fixed round limit - then stops and returns the best draft with what's still open, rather than looping forever chasing a clean pass. `epic-breakdown`, `status-report`, and `feedback-triage`'s own smoke tests all hit this cap with something still open, and each one shipped that gap as a visible note instead of hiding it - that honesty is the point of the pattern, not a failure of it.
- **Panel debate / cross-examination.** Distinct from parallel lenses: here the seats see and respond to each other's proposals over capped rounds before a synthesizer resolves what it can and records what stays genuinely disagreed. `technical-solution-proposal` (6 expert seats), `client-requirement-shaping` (8 seats plus two outside adversarial voices that can force another round), and `design-blueprint` (UX vs. product vs. growth) all use this where independent lenses would miss the disagreement itself.
- **Pipeline over parallel-with-a-barrier.** Most multi-stage workflows run each item through every stage independently rather than waiting for every item to finish one stage before any starts the next - wall-clock is the slowest single chain, not the sum of slowest-per-stage. Used as the default across the library; a real barrier is reserved for the few places that genuinely need every result at once (e.g. a critique round needing every lens's verdict before deciding whether to revise at all).
- **Hub-and-spoke, reference not duplicate.** The 8-workflow greenfield pipeline above is the clearest example: each document links back to the one before it with one minimal targeted edit, and every downstream step resolves the rest of the chain from that link - nothing is ever pasted twice. `code-review` and `docs-sync` use the same read-by-path discipline for evidence they cite.
- **Write-to-disk-return-status.** A document-writing agent gets `Write`/`Edit` tools, writes the real file itself, and returns only `{path, charCount, version}` - never the document text - so it's never re-embedded into a downstream prompt a second time. Applied across the greenfield pipeline's doc authors after a real audited run showed the alternative (returning full text, then re-pasting it back in) was the single largest source of wasted context in this library. See `reports/context-bloat-forensics/`.
- **Task-scoped invocation.** `tdd-blueprint`, `feature-implementer`, and `qa-suite-pro` each accept `<tasks.md path> | <task ID>` as an alternative to a whole free-text target - the framer/scoper reads exactly one row plus the documents it references, instead of the whole product's documentation, to do one task's worth of work.
- **Model tiering.** Judgment/synthesis phases (convergence, adversarial verification, cross-examination resolution) get `model: 'opus'`; execution/breadth phases (scoping, drafting, running tests, gathering evidence) stay on the session default. See `MODEL_SELECTION.md` for the full rationale and the workflow-by-workflow table.
- **Effort tiering.** The same per-phase logic applies to reasoning-effort budget, a separate lever from model choice: mechanical scoping/discovery phases get `effort: 'low'`, judgment phases already pinned to `model: 'opus'` also get `effort: 'high'`/`'xhigh'`, and breadth phases stay on the session default. See `EFFORT_SELECTION.md` for the rationale and the retrofit proof (`context-bloat-forensics`, `code-review`, `security-audit`).

## Auditing the library's own context usage

`context-bloat-forensics` (repo-internal, not part of the installable catalog) is a workflow that audits real transcripts of these workflows running, for the specific failure mode of context bloat: oversized inputs, content duplicated instead of referenced, unbounded loops, self-reported values nobody actually measured. Every real fix documented in `STATUS.md` and in individual packages' READMEs (write-to-disk-return-status, read-by-path critique, measured-not-estimated `charCount`, per-document context scoping) traces back to a finding this tool surfaced against a real run - see `reports/context-bloat-forensics/` for the evidence. Treating "does this workflow waste context" as its own auditable, fixable thing - not just "does it work" - is deliberate.

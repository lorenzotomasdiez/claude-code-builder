# Task Breakdown

Turns an existing PRD - plus its linked tech-stack, architecture, and design-system documents - into a **task index**: a short, reference-only list a coding agent works through one row at a time. It always opens with a fixed bootstrap sequence (repo/infra scaffold, toolchain verification, the design-system gallery page) before any product task, updates incrementally without touching finished rows when re-run, and archives tasks once they're safely done and nothing active still depends on them.

This is the next hub-and-spoke satellite after `tech-stack-selector`, `architecture-designer`, and `design-system-foundation-v2`: those three decide *what* to build and *how it should look*; this one turns that into *what order to build it in*, one small reference-only row at a time.

## Why this exists

Once a PRD, a tech stack, an architecture, and a design system are decided, there is still a gap between "we know what to build" and "an agent can pick up one piece of work and go." Without this workflow, that gap gets filled ad hoc - a coding agent (or a developer) either re-reads the whole PRD every time to figure out what's next, or invents its own task list that duplicates content from the other four documents instead of pointing at it. Both failure modes are exactly what the hub-and-spoke pattern this repo has been building exists to prevent.

`tasks.md` is deliberately an **index, not a narrative**. Every row is short - an ID, a title, its dependencies, its status, and a `References` column of file paths (with anchors) into the documents that already exist. Detail lives in those documents, never copied into the row. That is what makes "general to specific, on demand" work in practice: an agent reads the whole index cheaply to decide what's next, then opens only the one or two documents the chosen row actually references.

## The fixed bootstrap sequence

Every task index opens with exactly these three, unconditionally, before any task derived from the product itself:

- **T0 - Repo & infra scaffold** - set up the repository and toolchain the tech-stack and architecture documents specify.
- **T1 - Toolchain verification** - build/lint/typecheck/test commands all succeed with a real exit code, zero console errors, and the chosen tools are actually compatible together.
- **T2 - Design-system gallery page** - build exactly what `gallery-plan.md` specifies, at the location `component-map.md` agrees on.

Only `T3` onward are product-derived, one per requirement or per small vertical slice a single implementer would build and test together - never split by technical layer.

## Pipeline

```
Frame (1 agent: task-framer -> requirements, linked docs, existing tasks if updating)
  -> Draft/Update (1 agent: task-author -> writes or incrementally updates tasks.md, write-to-disk-return-status)
    -> Archive (1 agent: task-archiver, incremental runs only -> moves qualifying done tasks out)
      -> Critique (2 agents in parallel: traceability, dependency-integrity - opus)
        -> Revise (task-author fixes only the flagged rows, re-review, capped at 2 rounds)
```

## Design rationale

### Two modes, one workflow

`mode` is decided by whether an `existingTasksPath` was given, not by a separate command. On an **initial** run, `task-author` writes T0-T2 plus every product task and links the PRD once. On an **incremental** run, it only ever appends rows for newly-implied requirements and never touches an existing row's ID, title, dependencies, or status - re-running this workflow as a PRD gains requirements over a project's life is safe by construction, not by convention.

### Archiving is conservative on purpose

A task ID is a permanent reference - other tasks' `Depends on` column can point to it indefinitely. `task-archiver` only moves a task once it is `done`, has been done for a 14-day grace period, and **nothing still pending or in progress depends on it**. All three conditions, every time - an old-but-still-depended-on task never collapses, because collapsing it would force every reader of an active dependency to detour into the archive just to see what it needs. A collapsed row keeps its ID, title, status, and a pointer - it never disappears, so a dependency reference to an archived task never breaks.

### Write-to-disk-and-return-status, and one call owns the PRD edit

Same contract as `prd-writer`, `architecture-writer`, `stack-author`, and `ds2-doc-author`: `task-author` and `task-archiver` both write their files directly and return `{path, ..., charCount, version}` measured by reading the file back, never the document text and never a self-estimated size. Only the initial-run draft call touches the PRD's Links row, once, with a minimal targeted edit.

### Why a panel of two lenses, not one

`traceability` catches the failure mode that matters most for an index like this: a requirement nobody assigned a task to, or a task citing a reference that doesn't actually exist in the source documents. `dependency-integrity` catches the failure mode a narrative document doesn't have but an index does: cycles, dangling `Depends on` IDs, a broken archive pointer. Neither lens would reliably catch the other's failure class, so both run, adversarially, every round - the same "needs_revision if any lens flags it" rule as every other workflow in this library.

## Where it sits in the library

```
/prd-generator-v2 -> /tech-stack-selector -> /architecture-designer -> /design-system-foundation-v2
   -> /task-breakdown -> /tdd-blueprint <tasks.md> | <task-id> -> /feature-implementer <tasks.md> | <task-id>
```

`/tdd-blueprint` and `/feature-implementer` both gained a task-scoped invocation mode alongside this package (see their own READMEs) - given a task ID and this workflow's `tasks.md`, they read only that row's references instead of the whole document set, and `feature-implementer` makes the one edit back to `tasks.md` that marks the row done once every slice ships.

## Files

- `.claude/agents/*.md` - `task-framer`, `task-author`, `task-archiver`, `task-critic` (two lenses, one agent).
- `.claude/workflows/task-breakdown.js` - the orchestration script: sequential Frame, sequential Draft/Update, conditional Archive (incremental runs only), and a critique/revise loop capped at 2 rounds.
- `.claude/commands/task-breakdown.md` - the `/task-breakdown <PRD path> [| existing tasks.md path]` entry point.

## Changelog

- Fixed a folder-naming mismatch: `docs/tasks/<slug>/` now derives `<slug>` from the PRD's own filename stem (the same convention `tech-stack-selector.js` and `architecture-designer.js` already used), instead of re-slugifying the framer's `productSummary` sentence, which drifted from `docs/product-specs/`'s naming and could even vary run to run. Not yet re-verified end to end.

## Smoke test

Not yet run end to end.

Wiring verified so far: `node --check` passes on the orchestration script, `node scripts/validate-workflow.mjs task-breakdown` passes, and every `agentType` referenced in the workflow resolves to an agent definition in `.claude/agents/`.

What is still unproven: that all four schemas validate against real agent output, that an initial run's PRD link and T0-T2 generation are actually correct against a real PRD/tech-stack/architecture/design-system set, and that a second, incremental run against that same output correctly appends without touching existing rows and (once a task is old enough) archives correctly. Per this repo's definition of done, run `/task-breakdown <a real PRD path>` once, and - separately, not in the same session - a second incremental run against its own output, and record both results here. Do not run either repeatedly.

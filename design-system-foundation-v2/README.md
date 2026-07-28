# Design System Foundation v2

Turns `design-blueprint` output (or a plain product description) into a **stack-agnostic design system** - UX principles, design tokens, component contracts, usage rules, and an implementation contract - plus two documents `design-system-foundation` does not produce: a **component map** (where every component actually lives and what it is built from) and a **gallery plan** (the spec for the one page, built before any feature, that renders every component in isolation).

This is a sibling of `archive/design-system-foundation/`, not a replacement.
That package is left untouched.
This one exists to fix its context-bloat pattern and to answer a question the original never asked: once the PRD, the tech stack, and the architecture are decided, what do development and testing actually need in hand before the first component gets built?

## Why a v2 instead of editing the original

`design-system-foundation`'s `ds-doc-author` returns the full document text as its response, and the critique loop re-embeds the entire five-document set, as one giant string built by the orchestrator, into every one of four parallel critic prompts, on every one of up to two rounds - the same duplicate-instead-of-reference bug found and fixed in `prd-generator`, `tech-stack-selector`, and `architecture-designer`. Its final return value is also the whole document set as markdown, a second time. Per this repo's rule against touching the canonical/existing packages except to fix a defect in the very thing being asked for, and because this task also adds real new scope (the map and the gallery plan), it gets its own package instead of a patch to the original.

## What's new: the component map and the gallery plan

The five original documents are deliberately stack-agnostic - `components.md` describes a `Select`'s states and accessibility contract in a way that survives a framework change. That is correct for what it is, but it leaves a real gap: a developer, or a coding agent building against `/feature-implementer`, still has to invent *where* each component lives and *what it's actually built from* - and different implementers invent that differently, which is exactly the inconsistency this workflow exists to prevent one layer up.

**`component-map.md`** closes that gap. For every component in the catalog it states:
- **`sourcingStrategy`** - `custom` (built from scratch against the tokens), `library-primitive` (a UI-library component used close to as-is), or `library-composed` (several library primitives assembled into one catalog component). This works the same way whether the product is built in plain CSS or with a component library like shadcn/ui, because shadcn's own model is to copy real source files into your repo rather than ship an opaque package - so in both cases the output is a real, editable file at a real path, and `location` means the same thing either way. What differs is only whether that file starts from nothing or from a library primitive, and that is exactly what `sourcingStrategy` records.
- **`location`** - a real relative file path, grounded in `architectureComponents` (the module boundaries `architecture-designer` already decided) where one matches, or in stated platform/library conventions otherwise.
- **`isolationNotes`** - what a test, or a gallery entry, needs to fake to render this component alone: required inputs, any context it depends on. This is what makes component-level testing a real option instead of an aspiration.

The UI library itself is never chosen by this workflow. It is cited from `tech-stack-selector`'s decisions, picked up automatically when a PRD is given (see below) - if no library was decided, every component defaults to `custom` and the document says so plainly rather than guessing a popular one.

**`gallery-plan.md`** answers the second half of the request: what gets built first, besides infrastructure, so that development and testing can isolate component problems before they show up wrapped in a real feature. It specifies a single page - simple, Storybook-like, not Storybook itself unless the tech stack already uses it - that renders every entry from the component map in every state the catalog marked `applies: true`, with the controls needed to switch between them by hand. It states its own build sequencing in bold: right after the infrastructure scaffold, before the first feature. That sequencing instruction is the one place in this workflow's whole output that functions as a directive rather than a reference document - everything downstream (`/feature-implementer` in particular) is expected to read `implementation-contract.md`'s obligation about it and actually order the work that way.

Both of these documents are the deliberate exception to "no framework, no library, no code" - naming real technology is their entire purpose. The other five stay stack-agnostic exactly as before; a fifth critique lens, `buildability`, exists specifically to keep that boundary from leaking in either direction.

## Pipeline

```
Frame (1 agent: ds2-framer -> surface inventory, drivers, component groups, plus tech-stack/architecture facts pulled from a linked PRD)
  -> Foundations (2 agents in parallel: ds2-principles-author, ds2-token-author)
    -> Catalog (up to 4 agents in parallel: ds2-component-author, one per component group)
      -> Rules (1 agent: ds2-rules-author, needs the whole catalog to choose between components)
        -> Mapping (1 agent: ds2-component-mapper -> sourcing strategy + location per component)
          -> Gallery (1 agent: ds2-gallery-planner -> the isolation page's build spec)
            -> Author (7 agents in parallel: ds2-doc-author writes each document TO DISK, returns status only)
              -> Critique (5 agents in parallel: justification, accessibility, consistency, implementability, buildability - each reads all 7 docs by path)
                -> Revise (only the flagged documents are re-authored, in parallel, from their own file; capped at 2 rounds)
```

## Design rationale

### The catalog is still derived, never invented

Unchanged from v1, and just as load-bearing now that two more documents build on it: `ds2-framer` traces every component to a real surface, `ds2-component-author` rejects anything with an empty trace into `componentsRejected`, and `justification` deletes what slips through anyway. `component-map.md` and `gallery-plan.md` both inherit this discipline mechanically - they can only ever contain what the catalog already justified, because that is their only input for "which components exist."

### Write-to-disk-and-return-status, everywhere

`ds2-doc-author` never returns document text. It writes the file with the `Write` tool and reports `{path, charCount, version, prdLinked}`. This is the same contract already established in `prd-writer`, `architecture-writer`, and `stack-author` - the fix applies here too, and it applies to all seven documents including the two new ones, not just the original five. The orchestrator's `statuses` object holds small status records, never markdown strings, so nothing about document size compounds as it flows through later stages.

### Critics read by path, not by re-embedded string

The old workflow built one giant string of all five documents and pasted it into four parallel critic prompts, on every round - up to eight full-set copies of the same content across one run. `ds2-critic` instead gets a list of file paths and reads each one itself with the `Read` tool. The orchestrator never assembles that string at all. The `buildability` lens exists because `component-map.md` and `gallery-plan.md` are new cross-document surfaces the original four lenses were never scoped to check (every catalog component mapped, every mapped component's states present in the gallery, no library named without a citing decision).

### Mapping and Gallery are sequential, not fanned out

Mapping needs the *whole* catalog at once, because sourcing strategy has to be decided consistently across every group (a per-group fan-out would let two different agents make incompatible calls about the same UI library). Gallery then needs the *whole* resolved map, because a gallery with even one component missing defeats the reason it exists. Neither is expensive enough to be worth splitting, and both would produce contradictions if split.

### Only one document owns the PRD edit

When a PRD path is given, exactly one `ds2-doc-author` call - authoring `implementation-contract.md`, and only on its first pass - is told to also make the Links-row edit. Every other document-author call, including that same document's own revision passes, is explicitly told not to touch the PRD. This avoids seven parallel agents racing to edit the same file, the same solution already used in `architecture-writer` and `stack-author`.

### Tech-stack and architecture facts arrive through the PRD, never invented

`ds2-framer` reads the PRD's Links row, exactly the way `architecture-clarifier` does, and pulls a linked Tech Stack document's decisions and a linked Architecture document's component boundaries into its structured output. If neither is linked, both arrays are empty and the mapper says so rather than guessing - this workflow remains runnable from nothing but a design description or a bare product idea, same as v1.

## Where it sits in the library

```
/prd-generator -> /tech-stack-selector -> /architecture-designer -> /design-blueprint -> /design-system-foundation-v2 -> /tdd-blueprint -> /feature-implementer
```

Point it at a PRD (as the optional `prd` argument, alongside `design-blueprint` output or a raw description) to get the tech-stack/architecture pickup and the automatic link-back; point it at just a design description to run it standalone, same as v1. `design-system-foundation` and `design-blueprint` are both left unmodified.

## Files

- `.claude/agents/*.md` - `ds2-framer`, `ds2-principles-author`, `ds2-token-author`, `ds2-component-author`, `ds2-rules-author`, `ds2-component-mapper`, `ds2-gallery-planner`, `ds2-doc-author`, `ds2-critic`. All distinct agent names from the v1 package's `ds-*` agents so the two packages never collide when either is smoke-tested.
- `.claude/workflows/design-system-foundation-v2.js` - the orchestration script: sequential Frame, parallel Foundations, fan-out Catalog, sequential Rules/Mapping/Gallery, parallel Author (write-to-disk), and an issue-routing Critique/Revise loop capped at 2 rounds, with a per-document-type size ceiling enforced after Author and after every Revise.
- `.claude/commands/design-system-foundation-v2.md` - the `/design-system-foundation-v2 <design or idea> [| platform] [| brand] [| PRD path]` entry point.

## Changelog

- Fixed a folder-naming mismatch: when a PRD path is given, `docsDir` now derives its folder name from the PRD's own filename stem (the same convention `tech-stack-selector.js` and `architecture-designer.js` already used), instead of re-slugifying the framer's `productSummary` sentence. A real run showed the two conventions produce different, unrelated folder names for the same product - `docs/design-system/a-browser-based-markdown-editor-where-ai-generated-edits-ove/` next to an unrelated `docs/product-specs/chiri-requirement-md-prd.md`. The `productSummary`-based slug is now only a fallback for runs with no PRD path. Not yet re-verified end to end.
- Fixed the same charCount self-report bug already found and fixed in `prd-writer`/`architecture-writer`/`stack-author`: `ds2-doc-author` now must `Read` a document back after writing it and report the measured count, never an estimate. Grounded in a real run (audited in `reports/context-bloat-forensics/2026-07-28-workflows-folder-test-design-system-foundation-v2-run.md`) where a trim pass explicitly said it could not verify the character count and then reported 19,800 against a hard 20,000-char ceiling with no tool ever confirming it.
- Fixed the Author/Revise phase's biggest bloat source from that same audit: `systemContextFor(key)` used to hand every one of the 7 document authors (and every revise call) all 7 upstream objects (frame, principles, tokens, catalog, rules, componentMap, galleryPlan) regardless of which single document it was writing, pushing prompts to 322K-350K characters. It now returns only the object(s) that document's own structure calls for (e.g. `ux-principles.md` gets only `principles`; `component-map.md` gets only `componentMap`) - `implementation-contract.md` is the one genuine exception and keeps the full bundle, since it is the meta-document that references every other document's obligations.
- Fixed the same duplication in the Rules/Mapping/Gallery phases: each was receiving the full component catalog (including every component's accessibility/content/responsive blocks) even though Rules only needs name/purpose/whenToUse/whenNotToUse/alternative, Mapping only needs name/purpose/tracedTo, and Gallery only needs name/variants/states. Each phase now gets a trimmed projection of the same already-computed `catalog` instead of the full object, mirroring the existing precedent where the Rules phase already trimmed `tokens` down to role names only.
- Fixed the last finding from that audit: the 5 critique lenses each used to independently re-read all 7 full documents per round (10x total across 2 rounds), even though each lens's own checklist only ever cites a subset. Each lens is now scoped to only the documents its checklist actually references - `justification` reads 4, `accessibility` reads 2, `consistency` reads 5, `implementability` reads 5, `buildability` reads 3 - instead of all 7 every time.

## Smoke test

Not yet run end to end.

Wiring verified so far: `node --check` passes on the orchestration script. `node scripts/validate-workflow.mjs design-system-foundation-v2` passes. Every `agentType` referenced in the workflow resolves to an agent definition in `.claude/agents/`.

What is still unproven: that all seven schemas validate against real agent output, that `ds2-doc-author` actually writes seven distinct files and links a real PRD's Links row correctly, that the size ceilings (initial estimates - `ux-principles` 12000, `design-tokens` 20000, `components` 40000, `usage-rules` 20000, `implementation-contract` 16000, `component-map` 20000, `gallery-plan` 14000 - not yet validated against a real document's actual length the way `architecture-designer`'s ceiling was) are in a sane range, and that the five-lens critique/revision loop behaves when a critic returns `document: "all"`. Per this repo's definition of done, run `/design-system-foundation-v2 <a trivial single-screen idea> | responsive web` once - with and, separately, without a PRD argument - and record the input used, the phases that ran, and pass/fail here. Do not run it repeatedly.

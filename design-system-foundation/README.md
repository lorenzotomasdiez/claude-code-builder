# Design System Foundation

Turns `design-blueprint` output (or a plain product description) into a **stack-agnostic design system**: the UX principles, the design tokens, the component contracts, the usage rules for when to reach for what, and the implementation contract that says what the developer must hold to and how anyone can check that they did.

This is the step **between the design workflows and the developer**. It exists so that UI work starts from a set of decisions already made, instead of the implementer inventing spacing, states, and error treatments on the spot - and then a different implementer inventing different ones next sprint.

## Usage

```
/design-system-foundation docs/design/time-tracker | responsive web
```

or with brand constraints:

```
/design-system-foundation docs/design/time-tracker | iOS | existing brand: deep teal #0F4C5C primary, Inter, plainspoken tone
```

or straight from an idea, with no upstream design docs:

```
/design-system-foundation a mobile app that helps freelancers track billable hours and invoice clients | iOS
```

The command writes the document set to `docs/design-system/<slug>/`:

- `ux-principles.md` - three to five contestable principles, each with what it means to do, what it means to refuse, and the trade-off accepted
- `design-tokens.md` - semantic color roles with measured contrast ratios, type scale, spacing, radius, elevation, motion, breakpoints, themes as role overrides, and a mechanical mapping to CSS custom properties / Tailwind / `tokens.json` / native constants / Figma variables
- `components.md` - one implementation-independent contract per component: purpose, use and anti-use, anatomy, variants, **every state**, accessibility, content rules, responsive behavior, tokens consumed, and the surface each was traced to
- `usage-rules.md` - the centerpiece: modal vs page, toast vs inline, skeleton vs spinner, undo vs confirm, and the rest, each with a default and an explicit never; plus the state policy, layout rules, content voice, and the escalation path
- `implementation-contract.md` - the numbered obligations, a verification table saying how each is actually checked, the definition of done for a UI change, governance, and the open questions carried forward

## Pipeline

```
Frame (1 agent: ds-framer -> traced surface inventory, drivers, component groups)
  -> Foundations (2 agents in parallel: ds-principles-author, ds-token-author)
    -> Catalog (up to 4 agents in parallel: ds-component-author, one per component group)
      -> Rules (1 agent: ds-rules-author, needs the whole catalog to choose between components)
        -> Author (5 agents in parallel: ds-doc-author writes each document)
          -> Critique (4 agents in parallel: justification, accessibility, consistency, implementability)
            -> Revise (only the flagged documents are re-authored, in parallel; capped at 2 rounds)
```

## Design rationale

### The catalog is derived, never invented

The predictable failure mode of this workflow is a speculative design system: forty components, five of which the product uses, plus a `Toast` because there was a `Banner` and a fifth elevation level because four looked incomplete. That does not save the developer work, it adds it - now they read forty contracts to find the five that apply, and they stop reading the document.

So the whole pipeline hangs off `ds-framer`, whose only job is to inventory **what the source documents actually describe** and trace every screen, element, and component need back to where it came from. Every component contract carries a mandatory non-empty `tracedTo`. A component with nothing to trace to does not get written - it goes into `componentsRejected` with a reason, and that rejection table ships in `components.md` so nobody re-proposes it.

### The `justification` critic is the most important lens

Three of the four critique lenses are the ones you would expect. The fourth exists because inflation is this document set's specific disease: `justification` deletes any component, variant, token, or rule that no surface earns, cross-checks the components' `tokensUsed` against the token tables to find orphans, and calls out a set that is simply oversized for the product. Without that seat, the system grows by symmetry every time it is touched.

### Usage rules are the layer that actually does the work

A catalog tells you what exists. Rules tell you which one **this situation** calls for. Teams that ship the catalog and skip this layer still get inconsistent products - the components were consistent, the choices between them were not. So `usage-rules.md` is treated as the centerpiece rather than an appendix, its situations are drawn from the framer's `interactionPatternsNeeded` rather than a generic list, and every rule is schema-required to carry a `defaultChoice` and a `never`. A rule with options and no default is a menu, and a menu puts the decision back on the developer - the exact failure this workflow exists to prevent.

### Where the parallelism is, and where the barriers are

- **Foundations is a barrier on purpose.** Principles and tokens are independent derivations of the frame, so they run in parallel, but every component contract needs both - the principles it applies and the token roles it consumes - so the catalog genuinely cannot start until both have landed.
- **Catalog is a fan-out** over component groups, capped at 4 by the framer. Groups are independent: a form-input contract does not need to see the navigation contracts.
- **Rules is sequential and sees the whole catalog**, because its entire job is choosing *between* components. It cannot be fanned out without producing rules that contradict each other.
- **Critique is a barrier**, and this is the one place it is unambiguously right: an orphan token, a rule naming a component that does not exist, and an oversized catalog are all cross-document properties. Each critic gets all five documents at once.
- **Revision routes, rather than rewriting.** Every issue carries the one document that owns the fix, so a round re-authors only the flagged documents, in parallel, with their previous version and their own issues - not the whole set.

### Accessibility is enforced, not documented

There is deliberately **no** `accessibility.md`. A separate accessibility document is the one nobody opens. Instead it is pushed into the layers that get consulted: contrast lives in the token tables as computed ratios (the token author is told to compute relative luminance, not estimate by eye, and to fix a failing value rather than ship it with a caveat), keyboard maps and focus behavior and target sizes live in each component contract, and the checks live in `implementation-contract.md`'s verification table. The `accessibility` critic then recomputes marginal ratios rather than trusting the table.

### Stack agnostic, but not platform agnostic

Tokens, principles, and usage rules port across platforms cleanly. Component contracts largely do not: focus behavior, gestures, navigation models, and control conventions differ genuinely between web, iOS, and Android, and pretending otherwise produces a document that serves neither. So the workflow takes a platform target, the framer records that platform's conventions as a constraint on everything downstream, and the component contracts are written for that platform - while tokens and rules stay the portable layer. No document may name a framework, a library, or a CSS technology; the `implementability` critic fails the set if one leaks in.

### Why it feeds the developer rather than replacing them

The output is a frame, not an implementation. `implementation-contract.md` names the workflows downstream (`/feature-implementer`, `/tdd-blueprint`, `/code-review`) and what each should enforce, and pairs every obligation with a check that could actually run - a lint rule against raw hex values and off-scale spacing, an automated contrast pass, axe in CI, a keyboard-only pass. A rule nothing enforces has a shelf life of about one sprint.

## Where it sits in the library

```
/prd-generator -> /design-blueprint -> /design-system-foundation -> /tdd-blueprint -> /feature-implementer
```

It consumes `design-blueprint`'s `screens-and-ui.md`, `user-flows.md`, and `design-decisions.md`, but it is independently runnable: point it at any product description and the framer will inventory what that description implies, recording the thinner input as assumptions. `design-blueprint` is left unmodified.

## Files

- `.claude/agents/*.md` - `ds-framer`, `ds-principles-author`, `ds-token-author`, `ds-component-author`, `ds-rules-author`, `ds-doc-author`, `ds-critic`, each with a narrow job and an explicit "what you do not do" section. Distilled from `experts/design-systems-engineer.md` (added for this workflow) and `experts/ux-designer.md`.
- `.claude/workflows/design-system-foundation.js` - the orchestration script: sequential Frame, parallel Foundations, fan-out Catalog, sequential Rules, parallel Author, and an issue-routing Critique/Revise loop capped at 2 rounds.
- `.claude/commands/design-system-foundation.md` - the `/design-system-foundation <design or idea> [| platform] [| brand]` entry point, which writes the set to `docs/design-system/<slug>/`.

## Smoke test

Not yet run end to end.

Wiring verified so far: `node --check` passes on the orchestration script, and every `agentType` referenced in the workflow resolves to an agent definition in `.claude/agents/` (`ds-framer`, `ds-principles-author`, `ds-token-author`, `ds-component-author`, `ds-rules-author`, `ds-doc-author`, `ds-critic`). The `args` normalization block matches the `prd-generator` template.

What is still unproven: that all seven schemas validate against real agent output, and that the issue-routing revision loop behaves when a critic returns `document: "all"`. Per this repo's definition of done, run `/design-system-foundation <a trivial single-screen idea> | responsive web` **once** and record the input used, the phases that ran, and pass/fail here. Do not run it repeatedly.

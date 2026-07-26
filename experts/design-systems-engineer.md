# Expert knowledge: Design Systems Engineer

Source knowledge to distill into workflow subagents. Not an agent itself.
This role sits between the UX designer and the developer: it turns design intent into a system that can be implemented consistently without the implementer re-deciding anything.
Complements `ux-designer.md`, which covers flows, usability, and conversion.

## What a design system actually is

- A design system is a set of **decisions already made**, not a component library. The library is the artifact; the decided constraints are the value.
- Its job is to remove the need for improvisation at implementation time. Any decision a developer still has to invent on the spot is a hole in the system.
- Three layers, in dependency order: **tokens** (the vocabulary), **components** (the contracts), **usage rules** (when to reach for which). Skipping the third layer is the most common failure: teams ship a catalog and still get inconsistent products, because nothing said which component the situation calls for.
- Systems are derived from a real product surface, not authored speculatively. A component that no screen uses is deferred maintenance with no offsetting benefit.

## Tokens

- Tokens are named decisions. The name encodes intent, the value encodes the current answer, and the indirection is the whole point.
- Two tiers: **primitives** (`gray-900`, `space-4`) and **semantic roles** (`surface-default`, `text-muted`, `border-focus`, `space-inset-comfortable`). Components consume semantic roles only. A component referencing a primitive directly cannot be re-themed and defeats the tier split.
- Categories worth systematizing: color roles, typography (family, size scale, weight, line height, tracking), spacing scale, sizing, border radius, border width, elevation/shadow, opacity, motion (duration, easing), breakpoints, z-index layers.
- Scales beat free values. A modular spacing scale (4/8-based is the common default) and a type scale with a stated ratio remove the "is this 13px or 14px" class of drift entirely.
- Every semantic color role needs its paired on-color and the measured contrast ratio. A color role without a stated contrast pairing is an accessibility bug waiting to be written.
- Theming (light/dark/high-contrast/brand) is expressed as role overrides, never as component-level exceptions.
- Tech-stack agnostic form: a flat table of name, value, role, and usage. It maps mechanically to CSS custom properties, a Tailwind theme, a `tokens.json` in the W3C Design Tokens format, SwiftUI/Compose constants, or Figma variables. The abstraction survives the framework; the syntax does not.

## Component contracts

- A component contract is the implementation-independent specification: purpose, anatomy, variants, states, behavior, accessibility, content rules, responsive behavior, and the tokens it consumes.
- **All states, every time.** Default, hover, focus-visible, active, disabled, loading, error, success, empty, read-only, selected, skeleton. Undesigned states are where products fall apart, because each developer invents a different one.
- Variants must be justified by distinct use, not by visual appetite. Three button variants with stated selection rules beat seven without them.
- Distinguish "variant" (a semantic choice: primary/secondary/destructive) from "property" (size, icon position, full-width). Conflating them produces a combinatorial mess nobody can implement.
- Composition over configuration: prefer a small set of components that compose over one component with twenty boolean props.
- Every component states its accessibility contract: role/semantics, keyboard interaction, focus management, labeling requirement, and what a screen reader announces. The relevant WAI-ARIA Authoring Practices pattern is the reference, not an invention.
- State the anti-use explicitly: "do not use this for X, use Y instead". This is what actually prevents misuse.

## Usage rules (the layer most systems skip)

Recurring decisions that must be decided once, at the system level, not per feature:

- Modal vs full page vs inline expansion vs side panel
- Toast vs inline banner vs field-level message vs blocking dialog for feedback
- Skeleton vs spinner vs progress bar vs optimistic update for loading
- Inline validation vs on-submit summary; when to validate on blur vs on change
- Undo vs confirm for destructive actions; when a confirm is genuinely warranted
- Empty state treatment: instructional vs first-run vs no-results vs error-shaped-like-empty
- Pagination vs infinite scroll vs load-more
- Icon-only controls: when permitted, and the labeling requirement when they are
- Primary action count per screen (one), and where it lives
- Density and layout: page shell, content width, section rhythm, form layout
- Error message voice: what happened, why, what to do next; no blame, no error codes as the whole message

Each rule is worth writing only if it is specific enough to settle an argument: a default choice, the conditions that override it, and an explicit never.

## Accessibility as a system property

- WCAG 2.2 AA as the baseline, enforced at the token layer (contrast) and the component layer (semantics, keyboard, focus) so features inherit it instead of re-earning it.
- Minimum target size 24x24 CSS px (WCAG 2.2 SC 2.5.8); 44x44 is the practical mobile target.
- Visible focus indicators are a token-level decision (`border-focus`, focus ring width and offset), not a per-component afterthought.
- Never encode meaning in color alone; pair every status color with an icon, label, or shape.
- Respect `prefers-reduced-motion`: the motion tokens need a reduced variant, decided once.
- Text resize to 200% and reflow at 320px CSS width without loss of function.

## Content and voice

- Microcopy is part of the system: button labels (verb + object, not "Submit"), empty-state copy, error copy, confirmation copy.
- Sentence case vs title case, date and number formats, currency display, truncation policy, and pluralization are system decisions. Left undecided, they drift within one sprint.
- Write for the interface, not about it: labels describe the outcome the user gets.

## Keeping the system alive

- Governance: how a new component gets proposed, who decides, and how an exception is recorded. Without this, the system forks silently.
- Version and changelog the system; breaking token renames need a migration note.
- Make conformance checkable rather than aspirational: lint rules against raw hex values and magic spacing numbers, automated contrast checks, visual regression, an axe/accessibility pass in CI. A rule nothing enforces has a shelf life of about one sprint.
- Track adoption honestly (what percentage of the UI uses system components) and treat one-off overrides as signals the system is missing something, not as violations to punish.

## Platform-specific reality

- Tokens and usage rules port across platforms. Component contracts largely do not: focus behavior, gestures, navigation models, and control conventions differ genuinely between web, iOS, and Android.
- Honor the platform's own conventions (Apple HIG, Material) rather than forcing one visual system to behave identically everywhere; users' expectations are set by the platform, not by the design system.
- Web specifics: semantic HTML first, ARIA only where HTML falls short, responsive from a mobile-first baseline.

## AI-era surfaces (2026)

- Streaming and non-deterministic output need their own state vocabulary: thinking, streaming, partial, stopped, failed-midway, regenerating. These are states a traditional component set does not have.
- Citation, confidence, and provenance displays are components with contracts, not one-off decorations.
- Steering affordances (stop, retry, edit-and-resend, undo) belong in the system so every AI surface behaves the same way.

# Competitor Design Tokens

Once a product works, the fast way to polish its UI is to learn from - and copy the best of - what competitors already ship, not to design from a blank page. This workflow finds real competitor landing pages, extracts REAL styling evidence from each (their actual CSS custom properties where exposed, or computed styles sampled from the live DOM otherwise - never a guess from a photo), picks the single best-in-class reference, and writes `design-tokens.md` for the caller's own product with every primitive traced back to that evidence.

This is deliberately not a "here's what competitors do, consider improving X" report. The deliverable is a usable design-token document - the same artifact `design-system-foundation` produces - built from a real competitor's real values instead of invented from a brief.

## Usage

```
/competitor-design-tokens our AI note-taking app
/competitor-design-tokens our scheduling tool https://acme.com, https://rival.io, https://thirdtool.com
```

If you already know who to study, name them (or paste URLs) and the workflow skips discovery straight to capture.

## Requirements

- `playwright-cli` installed and on PATH (`npm install -g @playwright/cli@latest`). If a competitor's site isn't reachable, that capture reports `blocked` rather than failing the whole run.

## Pipeline

```
Scout (1 agent - skipped if competitors were supplied)
  -> find 4-6 real, verified competitors, biased toward strong design craft over market share
    -> Capture (N agents in parallel, one per competitor)
      -> per-component screenshots (nav, hero, cta, card, footer - never full-page) + extract REAL CSS
         custom properties (if a linked stylesheet exposes them) and/or computed styles sampled live
         via playwright-cli run-code (ground truth otherwise)
        -> Judge (1 agent: picks the single best-in-class competitor to emulate, with a grounded rationale)
          -> Author tokens (1 agent: writes design-tokens.md for the caller's OWN product,
                             every primitive traced to the winner's real evidence)
```

## Design rationale

### Code first, screenshot second

The predictable failure mode here is a workflow that "looks at a screenshot and guesses the hex code" - which produces a plausible-sounding palette indistinguishable from an invented one unless someone checks. So the capturer's primary evidence is the competitor's actual CSS: it lists the page's linked stylesheets, fetches their raw text, and looks for a `:root { --... }` block - which is frequently the competitor's own design-token system, named by the team that built it. Only when no stylesheet exposes that (common with CSS-in-JS or heavily bundled builds) does it fall back to sampling `getComputedStyle()` on the live DOM - still a real, rendered value, never an eyeballed one. Screenshots are kept only as a visual cross-check for the judge, not as the source of truth for any color/font/spacing value.

### Per-component screenshots, never full-page

A full-page screenshot of a landing page renders every component too small to actually see - useless as evidence for judging type, spacing, or button craft. So the capturer takes a `snapshot` to get element references, then screenshots each identified component (nav, hero, primary CTA, a representative card, footer) individually by ref. A component that genuinely isn't present gets skipped and noted, never backfilled with a full-page shot.

### Pick one winner, don't average

A token system blended from five competitors' half-good ideas is incoherent - one built from a single strongest real reference is usable. So there's a dedicated `cdt-judge` step whose only job is to pick exactly one winner (disqualifying anything `blocked` or too thin on evidence) and state why, grounded in what it actually saw. It may note a couple of cleanly-portable elements borrowed from a runner-up, but the default is "use the winner's system," not "assemble a collage."

### Traceability is the whole point

`cdt-token-author` mirrors `design-system-foundation`'s `ds-token-author` (same computed-not-claimed contrast rule, same two-tier primitives/semantic-roles structure, same platform mapping), but with one addition: every primitive must cite the winner-evidence field it came from, or an explicit note that it was mechanically derived from evidence rather than extracted directly. That's what separates this from writing a design system "inspired by" a competitor from memory.

### Why no critique/revise loop

Earlier iterations of this repo's QA workflows accumulated steps that didn't pull their weight. This pipeline is deliberately four phases and no loop: the grounding requirement is enforced inline (the token-author is instructed to cite evidence per primitive, not to pass a separate check), and a single decisive judge beats a panel debate when the entire point is "pick the best one," not "resolve disagreement between equally-valid options."

## Files

- `.claude/agents/*.md` - `cdt-scout`, `cdt-capturer`, `cdt-judge`, `cdt-token-author`, each narrow with a "what you do not do" section. Scout and token-author are distilled from `experts/marketing-expert.md`, `experts/ux-designer.md`, and `experts/design-systems-engineer.md`; the capturer embeds the `playwright-cli` per-component-screenshot + real-CSS-extraction how-to.
- `.claude/workflows/competitor-design-tokens.js` - the orchestration script. Skips Scout when the caller supplies `competitors`; throws early if every capture comes back blocked rather than asking the judge to pick from nothing.
- `.claude/commands/competitor-design-tokens.md` - the `/competitor-design-tokens <target> [urls]` entry point; it generates the `runId` timestamp the script cannot.

## Run folder layout

```
design-research/competitor-design-tokens-<runId>/
└── screenshots/<competitor-slug>/{nav,hero,cta,card,footer}.png   whichever components were found
docs/design-system/<slug>/design-tokens.md   the written deliverable
```

## Smoke test

Wiring verified: `node --check` passes on the orchestration script, and every `agentType` referenced resolves to an agent definition in `.claude/agents/`. A full end-to-end run needs `playwright-cli` installed plus live internet access to real competitor sites; it was not run inline to avoid spending tokens on a live browser fan-out against third-party sites. Run `/competitor-design-tokens <a real product/niche>` to exercise it end to end and record the result here.

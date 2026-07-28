# Screen Suite

Reads every functional requirement in a PRD, decides which of them are actually screens, renders them all through Stitch in a design system that was **already chosen and approved**, and assembles them into one contact-sheet page you can scroll to see the whole product at once.

This is the second half of a pair. `design-preview` answers "do I like this direction" with one screen. `screen-suite` answers "what does the whole product look like in it" with all of them. Running this one first is a mistake it will refuse to make for you: rendering a dozen screens in a direction nobody has approved spends a dozen paid generations to discover the direction was wrong.

## The pipeline

```
       PRD folder (index.md + any fr-N.md)      stitch.json (from design-preview)
                        |                                    |
   [Extract]   requirement-extractor  sonnet, low effort      |
               reads the index table AND every promoted       |
               fr-N.md; returns the complete FR list          |
                        |                                     |
   [Plan]      screen-planner  sonnet                         |
               FR -> screen is NOT one-to-one:                |
                 - several FRs share one screen               |
                 - some FRs are states on another screen      |
                 - some FRs have no UI at all                 |
               writes each screen prompt, ranks importance,   |
               AND specifies the shell + sample world every   |
               screen must share                              |
                        |                                     |
                   screen cap: drops edge before supporting   |
                   before core, and NAMES what it dropped     |
                        |                                     |
   [Anchor]    suite-renderer  sonnet  ---------------------> Stitch
               the core screen, alone and first; reports the
               shell it ACTUALLY built
                        |
   [Render]     batches of 3 -----------------------------> Stitch
               suite-renderer  suite-renderer  suite-renderer      (sonnet)
               one screen each, every prompt prefixed with the
               shared shell + the anchor's real chrome
                        |
   [Unify]     suite-unifier  sonnet  ----------------------> Stitch
               ONE edit_screens call over ALL screen ids at
               once, converging them into one application,
               then refreshing the local files
                        |
   [Gallery]   gallery-author  sonnet          <- genuine barrier
               one page embedding every screen, plus the
               list of FRs that deliberately have no screen
                        |
   [Record]    suite-recorder  haiku
               merges every screen into stitch.json
                        |
          docs/design-preview/<slug>/
             index.html            <- the deliverable
             screens/*.html
             stitch.json           <- now holds every screen
```

## Why it is shaped this way

**The planner exists because requirements are not screens.** This is the load-bearing idea of the whole workflow. A PRD with twelve functional requirements does not have twelve screens: some are server-side rules with no surface at all, some are states (error, offline, empty) that belong *on* a screen rather than beside it, and several usually collapse onto one main working surface because that is genuinely how a user meets them. Mapping one requirement to one screen would render a dozen near-identical mockups plus a few pictures of nothing, at full price. The planner is given explicit permission, and explicit pressure, to say "no screen" and to say "these four are the same screen".

The real PRD this was built against makes the point: 12 requirements, of which the request-throttling rule, the local-persistence guarantee, and the offline-failure behavior are respectively invisible, invisible, and a state of the main editor.

**Fan-out in batches of 3, not one wide `parallel()`.** The runtime would happily run up to 16 lanes at once. Each lane here is a paid, minutes-long, non-idempotent write against a single Stitch project, and 16 simultaneous generations is more pressure than is polite to put on that API. Batching also bounds the damage: if the first three come back wrong, you have spent three generations finding out, not thirty.

**The screen cap names what it dropped.** Default 10. When the plan exceeds it, the run drops `edge` screens before `supporting` before `core`, then logs every single screen it did not render along with how to get it. A silent cap is the worst possible behavior here, because a gallery with 10 of 22 screens looks exactly like a complete product unless something says otherwise.

**The Gallery phase is a real barrier, and this repo's conventions say to justify those.** It qualifies: a contact sheet is by definition a view over the entire result set, so it genuinely cannot start until every screen has resolved. Everything upstream of it is either sequential by necessity or batched.

**No critique loop.** Same reasoning as `design-preview`: the reviewer is the human scrolling the gallery. Agents arguing about screens they cannot see would add cost and latency and settle nothing.

**Screen prompts say nothing about styling.** The planner is forbidden from mentioning colors, fonts, or radii, exactly as `design-preview`'s scoper is. Styling arrives through the `designSystem` parameter. A prompt that also describes styling competes with the design system, and the resulting screens would not be a fair test of it.

### Sharing a design system is not enough, and this cost a rewrite to learn

The first version of this workflow assumed that pointing every generation at the same `designSystem` asset would make the screens look like one product. It does not, and the failure is structural rather than a tuning problem.

**A Stitch design system carries tokens only**: `colorMode`, `customColor`, `headlineFont`, `bodyFont`, `roundness`, `designMd`. Color, typography, shape. It carries no product identity - no top bar, no navigation, no layout structure, no sample data. So N independent `generate_screen_from_text` calls come back reliably sharing a palette and a typeface, and reliably looking like N different applications: one grew a sidebar, another moved its actions to a footer, a third invented a different user's name.

The first version made this worse on purpose. `suite-renderer` was told that the other instances "cannot see each other" and to "stay strictly inside the one screen you were given" - written as a guard against scope creep, and in practice a guarantee that nothing would be shared. The planner was told to "keep the set coherent", which is advice, not a mechanism.

Three changes, in increasing order of cost:

1. **The planner now specifies the shell.** `productShell` describes the persistent chrome concretely enough to build from, and `sampleWorld` fixes the one fictional user and document every screen is populated from. Both are prefixed onto every screen prompt. Free, and it removes the largest source of drift.
2. **An anchor screen renders first, alone.** The `core` screen goes ahead of the batch and its renderer reports the chrome **as actually built in the returned markup**, which is not always what was planned. Every later screen is told to match that. Costs nothing extra: it just serializes one screen that was going to render anyway.
3. **A unify pass over the whole set.** `edit_screens` takes every screen id in a **single call**, so the model performing the edit sees all the screens together and can make them agree. This is the one cross-screen consistency mechanism Stitch actually offers, and the first version of this workflow did not use it at all. One call regardless of screen count; disable with `unify: false`.

Steps 1 and 2 aim every generation at the same target. Step 3 is the only one that can see where they actually landed. The unifier is explicitly forbidden from touching the design system or from flattening what makes each screen different - only the shell around the content converges.

**Tools deliberately not used.** `generate_variants` produces 1-5 variants of an existing screen with a `creativeRange` from REFINE to REIMAGINE. That is for exploring alternatives of one screen, not for making two different screens share a shell, so it is the wrong instrument here (it would be the right one for an "explore three directions for this screen" workflow). `create_design_system_from_design_md` needs an `upload_design_md` plus an existing screen instance, and the inline `designMd` field reaches the same place with one call instead of two.

**It refuses to invent a design system.** No manifest, no run - the script throws before spending anything, with a message pointing at `/design-preview`. Choosing a direction is a decision a human should make while looking at one screen, not a side effect of a bulk render.

## Model and effort selection

Per `MODEL_SELECTION.md` and `EFFORT_SELECTION.md`, the unit is the phase:

| Phase | Agent | Model | Effort | Why |
|---|---|---|---|---|
| Extract | `requirement-extractor` | sonnet | low | A file-reading inventory with an explicit checklist (the index table). Mechanical by construction, which is exactly `EFFORT_SELECTION.md`'s `low` case. |
| Plan | `screen-planner` | sonnet | default | The judgment that sizes and shapes the entire run, and now also authors the shell spec every screen depends on. Every mistake here is paid for at the Render phase. |
| Anchor | `suite-renderer` | sonnet | default | Same agent as Render, run alone and first. It has to read the markup it got back and describe the chrome accurately, since everything downstream copies its answer. |
| Render | `suite-renderer` | sonnet | default | Long-running no-retry MCP protocol. See below - this is the phase where using a cheaper model already cost a real run. |
| Unify | `suite-unifier` | sonnet | default | Has to diff several screens by eye, name the real divergences, and write one specific edit prompt. A vague prompt here produces a vague edit. |
| Gallery | `gallery-author` | sonnet | default | Writes real HTML/CSS that has to be legible and neutral. |
| Record | `suite-recorder` | haiku | low | Single-shot file writing, content already merged. No MCP involved. |

**Why the renderer is not on Haiku, learned the hard way.** `design-preview` originally ran its equivalent phase on `haiku` with the reasoning that MCP calls are mechanical transcription. Its first real run failed: the Haiku agent never called `ToolSearch` at all, then reported that the Stitch MCP server was "not connected to this session" - a conclusion it had not checked, while the server was in fact connected. A `ToolSearch` plus chained MCP calls is a multi-step protocol, not a transcription. Every MCP-calling agent in this package is `sonnet`, and carries an explicit rule that MCP tools are deferred and therefore invisible until searched for, so an empty tool list is not evidence of anything.

**No `tools:` allowlist on MCP-calling agents.** `suite-renderer` deliberately declares no `tools:` frontmatter line. That field is an allowlist: `design-preview`'s provisioner declared `tools: ToolSearch` and was consequently forbidden from calling the very MCP tools it searched for. Agents that need MCP inherit the full tool set here. Agents that do not (`requirement-extractor`, `screen-planner`, `suite-recorder`, `gallery-author`) keep a narrow allowlist, which is correct hygiene for them.

## Files

```
screen-suite/
  .claude/
    agents/
      requirement-extractor.md   inventories every FR, including promoted fr-N.md files
      screen-planner.md          decides screens vs shared screens vs no screen
      suite-renderer.md          one screen each, anchor first then parallel batches
      suite-unifier.md           the one edit_screens pass over the whole set
      gallery-author.md          the contact sheet
      suite-recorder.md          merges everything into stitch.json
    commands/
      screen-suite.md            the /screen-suite entry point
    workflows/
      screen-suite.js            orchestration: extract, plan, cap, batch, gather, record
  README.md
```

## Usage

The normal path, after `/design-preview` has produced a direction you like:

```
/screen-suite docs/prd/chiri
```

Cap the spend on a large PRD:

```
/screen-suite docs/prd/chiri | max: 5
```

Render only the screens covering specific requirements, which is also how you pick up screens a cap dropped:

```
/screen-suite docs/prd/chiri | only: FR-5, FR-6
```

Skip the unify pass, when you want the raw independent generations to see how far apart they land:

```
/screen-suite docs/prd/chiri | no-unify
```

Output lands in `docs/design-preview/<slug>/`. Open `index.html`.

### Requirements

- The Stitch MCP server must be connected to the session.
- `docs/design-preview/<slug>/stitch.json` must exist, from a completed `/design-preview` run. The workflow throws immediately without it rather than inventing a design system.

### Cost, stated plainly

One paid Stitch generation per planned screen, each taking minutes, plus one `edit_screens` call for the unify pass (one call for the whole set, not one per screen). A 12-requirement PRD typically plans 5 to 8 screens. Use `max:` on anything larger, and read the plan in the run log before assuming the count is what you expected.

## Smoke test

**Not yet run.** Anatomy validates (`node scripts/validate-workflow.mjs screen-suite` and `node schema-lint/schema-lint.mjs screen-suite` both pass: the command, the five agents, every schema, and every `agentType` reference resolve, and the script parses).

It is being held for an explicit go-ahead, for the same reason as `design-preview` and more so: a run creates several real, paid Stitch generations on the user's account. That is not a cost to spend on a build step without being asked.

There is also a hard prerequisite that does not exist yet: **`screen-suite` cannot run until `design-preview` has completed successfully once**, because it refuses to run without a `stitch.json`. As of this writing `design-preview` has one recorded failed run and a fix that has not been re-verified (see its README). So the order is: re-run `design-preview`, confirm it produces a manifest, then smoke-test this one with `max: 2` to prove the wiring cheaply before spending a full suite.

What the smoke test needs to establish:

1. `requirement-extractor` finds requirements in **both** `index.md` and the promoted `fr-N.md` files, and its count matches the PRD's own requirement table.
2. `screen-planner` returns fewer screens than requirements, with a populated `noScreen` list. If it returns one screen per requirement, the central idea of this workflow did not survive contact with a real model, and the agent prompt needs work.
3. `productShell` comes back as a buildable specification rather than an adjective, and the anchor screen's `shellDescription` describes chrome that is genuinely in its markup.
4. **The screens actually look like one product.** This is the point of the rebuild and it is the one criterion that cannot be checked mechanically: open the gallery and see whether the shell is the same across screens. If they still read as different applications, the prompt-level fixes are not enough and the unify pass is doing less than hoped.
5. `edit_screens` accepts every screen id in one call and returns, and the unifier refreshes the stale local files afterwards rather than leaving HTML on disk that no longer matches Stitch.
6. `suite-renderer` calls `ToolSearch` as its first action, in a parallel batch, and does not retry a slow generation.
7. Parallel lanes writing into the same Stitch project do not collide or trip a rate limit.
8. `gallery-author` produces a page whose iframes actually resolve when opened from disk.
9. `suite-recorder` merges new screens into the existing manifest without dropping the ones `design-preview` put there.

Record the result here honestly, including which point failed if any do.

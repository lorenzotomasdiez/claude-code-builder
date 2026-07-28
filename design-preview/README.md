# Design Preview

Turns a PRD into two things a human can judge in about five minutes: a `DESIGN.md` that states a visual direction and argues for it, and **one real rendered HTML screen** in that direction, generated through the Stitch MCP server.

This is a taste test, not a design system. The question it answers is "do I like where this is going", asked early enough that answering "no" is cheap. `design-system-foundation-v2` is the heavy workflow that produces the full token set, component contracts, and usage rules; this one exists so nobody spends that effort on a direction the stakeholder was never going to like.

It is the first workflow in this library that calls MCP tools.

## The pipeline

```
                     PRD (path or prose)
                              |
   [Read]            preview-scoper                      sonnet
                     picks the ONE most representative screen,
                     extracts brand signals, writes the content
                     prompt (deliberately silent about styling)
                              |
              +---------------+---------------+
              |                               |
        no manifest yet                manifest exists
              |                               |
   [Direct]   design-director  sonnet         |  skip both phases,
              DESIGN.md + the exact           |  reuse the saved
              Stitch token values             |  projectId and
              |                               |  designSystemAsset
   [Provision] stitch-provisioner  sonnet     |
              create_project ->               |
              create_design_system ->         |
              update_design_system            |
              |                               |
              +---------------+---------------+
                              |
   [Render]          screen-renderer                     sonnet
                     generate_screen_from_text ONCE,
                     poll get_screen, write the HTML
                              |
   [Record]          preview-recorder                    haiku
                     DESIGN.md + stitch.json manifest
                              |
                docs/design-preview/<slug>/
                   DESIGN.md
                   <screen-name>.html   <- the actual deliverable
                   stitch.json          <- makes run 2 match run 1
```

## Why it is shaped this way

**Sequential, not parallel, and that is deliberate.** Almost every other workflow in this library fans out. This one must not. Each Stitch call is a non-idempotent write with a real cost: `create_project` makes a project, `generate_screen_from_text` bills a generation that takes minutes. `parallel()` over calls like these buys nothing (there is one screen) and risks duplicate projects and duplicate charges. The control flow that matters here is the branch, not the fan-out.

**No critique loop either.** The reviewer is the human looking at the HTML. A panel of agents arguing about a design direction they cannot see is theater; the whole point of rendering a real screen is that a person judges it with their eyes. Adding a critic would add cost and latency to a workflow whose only virtue is being fast.

**The enum decision lives with the smart agent, not the agent making the call.** `design-director` returns the literal Stitch enum values (`INTER`, `ROUND_TWELVE`, `DARK`, a hex seed color), schema-constrained. `stitch-provisioner` then transcribes those fields into the API call and decides nothing. The split is worth keeping regardless of who executes the call: it keeps the taste decision with the agent that has the product context, and leaves the API step with nothing to get creative about. It was originally the argument for running the provisioner on Haiku, and that part did not survive contact with a real run - see the smoke-test record below.

**The screen prompt says nothing about styling.** `preview-scoper` describes layout, elements, and sample data; it is explicitly forbidden from mentioning colors, fonts, or radii. Styling arrives through the `designSystem` parameter instead. A prompt that also describes styling competes with the design system and produces a screen that partly ignores it, which makes the preview useless as a test of the system.

**The manifest is the difference between a toy and a tool.** Without `stitch.json`, every run creates a fresh project with a fresh design system, so the second screen never matches the first. With it, run two skips Direct and Provision entirely and generates against the saved `designSystemAsset`. The slash command reads the manifest before invoking the workflow, because a workflow script has no filesystem access - see below.

**Reuse runs must not rewrite DESIGN.md.** On the reuse path there is no `design-director` output, so `preview-recorder` is explicitly told to leave the existing `DESIGN.md` alone rather than reconstruct one from the manifest. The file on disk is the real record of how the design system was made; a reconstruction would be a plausible-looking forgery of it.

## Model and effort selection

Per `MODEL_SELECTION.md` and `EFFORT_SELECTION.md`, the unit is the phase. This workflow follows `qa-suite-pro`'s precedent of putting mechanical steps on Haiku, and the reasoning is about blast radius, not token volume:

| Phase | Agent | Model | Effort | Why |
|---|---|---|---|---|
| Read | `preview-scoper` | sonnet | default | Choosing the representative screen IS the product. A settings page renders beautifully and tells a stakeholder nothing. |
| Direct | `design-director` | sonnet | default | The taste call. If the direction is wrong, a perfectly executed pipeline produced garbage. |
| Provision | `stitch-provisioner` | sonnet | default | Was haiku, on the reasoning that it is pure transcription of values already decided. The first real run proved that wrong: see the smoke-test record. The step is a `ToolSearch` plus three chained MCP calls, which is a multi-step protocol, not a transcription, and Haiku 4.5 skipped the search entirely and reported a platform failure that had not happened. |
| Render | `screen-renderer` | sonnet | default | Long-running, no-retry protocol. Stitch's own docs say do not retry on timeout and poll `get_screen` instead; a mistaken retry costs a duplicate paid render of several minutes. |
| Record | `preview-recorder` | haiku | low | Writes two files whose content was handed to it finished. |

This workflow pins `model: 'sonnet'` explicitly on its four non-Haiku phases rather than leaving them on the session default, which is a deliberate deviation from `MODEL_SELECTION.md`'s "unmarked means session default" convention. The reason is specific to this workflow: its entire value proposition is being cheap and fast enough to run on a whim, and inheriting an Opus session would silently turn a five-minute taste test into an expensive one. Note also that `model: 'haiku'` resolves to `claude-haiku-4-5`, a generation behind Opus/Sonnet 5, which is a further reason the Haiku phases are confined to single-shot work rather than multi-step MCP protocols.

## Calling MCP tools from a workflow

Worth stating plainly, since this is the first package here to do it:

- A workflow **script** cannot call tools. Its sandbox has `agent()`, `parallel()`, `pipeline()`, `phase()`, `log()`, `args`, `budget`, and no filesystem, no Node APIs, no tool access.
- A workflow **subagent** can reach every MCP server connected to the session, via `ToolSearch`. Schemas load on demand, per agent.
- So each agent that touches Stitch begins by calling `ToolSearch` with an explicit `select:mcp__stitch__...` list. Naming the tools beats a keyword search: it is deterministic, and the agent fails loudly with a useful message when the server is not connected instead of quietly improvising.
- Because the script cannot read files, the **slash command** reads `stitch.json` and passes it in `args`. That keeps the resume path out of the sandbox rather than spending an extra agent on a file read.
- Caveat carried from the runtime: interactively-authenticated MCP servers may be absent in headless or cron runs. This workflow is built for interactive use.

## Files

```
design-preview/
  .claude/
    agents/
      preview-scoper.md       picks the screen, writes the content prompt
      design-director.md      authors DESIGN.md and the token values
      stitch-provisioner.md   creates the project and design system
      screen-renderer.md      generates the screen, saves the HTML
      preview-recorder.md     writes DESIGN.md and stitch.json
    commands/
      design-preview.md       the /design-preview entry point
    workflows/
      design-preview.js       orchestration: branch on the manifest, 5 sequential phases
  README.md
```

## Usage

First run, from a PRD file:

```
/design-preview docs/prd/time-tracker.md
```

Or straight from a description, with no PRD written yet:

```
/design-preview a mobile app that helps freelancers track billable hours and invoice clients
```

A second screen in the same style, reusing the saved project and design system:

```
/design-preview docs/prd/time-tracker.md | screen: invoice detail
```

Output lands in `docs/design-preview/<slug>/`. Open the HTML file in a browser: that file is the deliverable, and the workflow has done its job the moment you can say yes or no to it.

### Requirements

The Stitch MCP server must be connected to the session. Every agent that needs it checks and fails with an explicit message rather than improvising, so a missing server produces a clear error rather than a confusing one.

### About the manifest

`stitch.json` holds the Stitch `projectId` and `designSystemAsset` plus a record of every screen generated. Committing it is the point: it is how a team shares one visual direction across runs. Two things to know:

- The ids are scoped to the Stitch account that created them. They are not secrets, but a teammate without access to that account cannot use them, and their run will fail rather than silently starting over.
- Losing the file is recoverable but annoying: `list_design_systems` can find the asset id again. The manifest is convenience and determinism, not the only copy.

## Smoke test

**FAIL** (2026-07-28), against the `chiri-markdown-ai` PRD, run `wf_7618c2ff-b45`. Fixed since, and **not yet re-run**.

What happened, phase by phase:

| Phase | Result |
|---|---|
| Read (`preview-scoper`, sonnet) | **PASS**. Schema-valid, and the judgment was right: it picked the mid-draft editor showing both a ghost-text continuation and an inline tracked-change proposal, over the login gate and the empty state, on the grounds that it is the only screen where the product's whole thesis is visible at once. |
| Direct (`design-director`, sonnet) | **PASS**. Valid enum values, and a DESIGN.md that argues rather than describes: muted teal-ink seed, Newsreader over Work Sans to separate document from tooling, tight radii borrowed from code-editor diffs, and a "what this direction rejects" section naming the violet-gradient AI-product palette and the chat-panel layout as the alternatives it refuses. |
| Provision (`stitch-provisioner`, haiku) | **FAIL**. Returned `status: failed` with the note "Stitch MCP server is not connected to this session". |
| Render, Record | Never reached - the script threw on the missing ids, correctly. |

**The failure note was wrong, and the transcript proves it.** The provisioner made **zero tool calls** in its entire run. It emitted one sentence ("Let me start by attempting to load and call the Stitch tools") and then went straight to `StructuredOutput` with `failed`. It never called `ToolSearch`. Meanwhile the Stitch MCP server was demonstrably connected: the main session called it directly moments later and created the project by hand.

So this was not a platform limitation. Two causes, both defects in this package as originally written:

1. **The `tools:` frontmatter was an allowlist that excluded MCP.** `stitch-provisioner` declared `tools: ToolSearch`, which grants exactly that and nothing else - so even a successful `ToolSearch` would have returned a schema for a tool the agent was not permitted to call. It also means the agent, looking at its own visible tool list, saw no Stitch tools and concluded they did not exist. Both MCP-calling agents now declare no `tools:` line at all, inheriting the full tool set.
2. **Haiku was the wrong model for that step, by this README's own stated rule.** The section above argued Haiku should be confined to single-shot work "rather than multi-step MCP protocols", and then assigned it a step that is a `ToolSearch` plus three chained MCP calls. That is not single-shot. `stitch-provisioner` is now `sonnet`.

Both agents also now carry an explicit rule that MCP tools are deferred and therefore invisible until searched for, so an empty tool list is not evidence of anything, and reporting Stitch as unreachable without a `ToolSearch` call whose result actually came back empty is a failure.

What this run did establish, and it is not nothing: the command reached the Workflow tool with `args` as an object, the branch-on-manifest logic took the correct first-run path, both schemas validated against real agent output, `agentType` resolution worked for all three agents that ran, and the guard clause failed loudly with an accurate message instead of proceeding to render against missing ids.

What remains genuinely unproven is the part that matters most: **whether a workflow subagent can reach the Stitch MCP server at all.** The failed run does not answer it either way, because the agent never asked. The next run answers it.

Anatomy still validates after the fixes (`node scripts/validate-workflow.mjs design-preview`, `node schema-lint/schema-lint.mjs design-preview`), but the fixes themselves are unverified: they are a diagnosis from one transcript, not a proven repair.

The re-run is deliberately held for an explicit go-ahead rather than launched automatically, because unlike every other package in this library its smoke test is not free and not local: a run creates a real Stitch project on the user's account and spends one real paid screen generation that takes several minutes. That is an outward-facing, billed side effect, so it is the user's call to spend.

What the re-run needs to establish:

1. `stitch-provisioner` actually calls `ToolSearch` as its first action. **This is the whole point of the re-run.** If it searches and Stitch resolves, the diagnosis was right and the package works. If it searches and Stitch comes back empty, the platform limitation is real after all, and the workflow needs restructuring so the MCP calls happen in the main session (the `product-blueprint` command-driven shape) rather than in a subagent.
2. It returns both ids from a design system created with the nested `theme` object intact.
3. `screen-renderer` survives the long generation without retrying, and writes a real HTML file.
4. `preview-recorder` writes a manifest a second run can actually consume.

Record the result here honestly, including which point failed if any do.

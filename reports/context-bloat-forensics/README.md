# Context Bloat Forensics (local, repo-internal tool)

This is NOT part of the installable workflow library in this repo's top-level
directories (`prd-generator/`, `code-review/`, etc). It is a maintenance tool
for the library itself: point it at a folder of Claude Code transcripts and
it tells you where a run got tangled - oversized inputs, duplicated content
that should have been a path/line reference instead, unbounded loops,
redundant agents, scratch files nobody reads again.

It deliberately lives inside this repo's own `.claude/` (agents, workflows,
commands), not as a top-level package, so it never shows up in
`workflow-installer`'s `list` command and never gets copied into someone
else's project. `install_workflow.py` discovers packages by scanning the
repo's top-level directories for a nested `.claude/workflows/`; the repo
root's own `.claude/` directory is never itself treated as one of those
top-level packages, so this tool is invisible to that scan by construction.

## Why this exists

Context is finite. A workflow that hands a 100k-token file straight into one
agent's context, or that copies the same large blob into three different
agent prompts instead of referencing it once by path and line range, quietly
burns the budget every workflow in this library has to share. This tool
reads the forensic evidence of what actually happened in a real run (or a
folder of them) and turns it into a narrative plus a findings list, so
problems like that get caught and fixed at the workflow-design level instead
of being rediscovered by hand each time.

## Pipeline

```
Discover (1 agent, Bash only, never reads file contents)
  -> for each transcript file, pipelined (no barrier between files):
       Narrate (1 agent per file: reconstructs a structured timeline)
         -> Critique (1 agent per file: finds evidenced bloat anti-patterns)
  -> Synthesize (1 agent, barrier: needs every file's timeline + findings together)
```

- **Discover** only shells out to `find`/`stat` for file paths, sizes, and
  mtimes - it never opens a transcript, because the discovery step itself
  must not be a source of bloat.
- **Narrate** and **Critique** run per file through `pipeline()`, not
  `parallel()` with a barrier: file A can reach Critique while file B is
  still being narrated, so wall-clock scales with the slowest single file's
  chain, not the sum of every file's narrate-then-critique time.
- The narrator is explicitly instructed to respect its own bootstrap
  problem - the transcript it is auditing can itself be too large to read in
  full, which would repeat the exact failure this tool exists to catch. It
  reads small files whole and greps/samples large ones instead of Reading
  them entirely.
- **Synthesize** is the one deliberate barrier: only it needs every file's
  results at once, to deduplicate repeating findings across files and write
  one coherent narrative instead of N disconnected ones.

## Files

- `.claude/agents/context-bloat-forensics-discoverer.md` - enumerates
  transcript files chronologically with size metadata, no content reads.
- `.claude/agents/context-bloat-forensics-narrator.md` - reconstructs one
  file's timeline of events (commands run, agents spawned, files touched,
  errors), sampling instead of fully reading large files.
- `.claude/agents/context-bloat-forensics-critic.md` - reviews one file's
  timeline for concrete, evidence-checked bloat findings with a
  recommendation each.
- `.claude/agents/context-bloat-forensics-synthesizer.md` - merges every
  file's timeline and findings into one report: narrative, deduplicated
  findings, recommendations per workflow/agent/script.
- `.claude/workflows/context-bloat-forensics.js` - the orchestration script.
- `.claude/commands/context-bloat-forensics.md` - the `/context-bloat-forensics
  <folder>` entry point; writes the report to
  `reports/context-bloat-forensics/<date>-<slug>.md`.

## Usage

```
/context-bloat-forensics /path/to/a/folder/of/transcripts
```

Point it at a directory holding `journal.jsonl` + `agent-*.jsonl` from a
Workflow run's transcript dir, or at a folder of raw Claude Code session
transcripts (`~/.claude/projects/<project>/*.jsonl`), or a mix. It reports
what it found even if the folder mixes kinds.

## Smoke test

**Status: PASS** (2026-07-27).

Input: a folder holding one small (23.5 KB, ~5.9k estimated tokens) real
Claude Code session transcript copied into the scratchpad
(`cbf-smoke/session-1.jsonl`) - a trivial, single-file input to prove the
wiring, not a production-scale audit.

Phases that ran: Discover -> Narrate -> Critique -> Synthesize, all four
agent types resolved correctly, all three schemas (`DISCOVERY_SCHEMA`,
`TIMELINE_SCHEMA`, `CRITIQUE_SCHEMA`) validated on the first attempt, and the
synthesizer produced a well-formed three-section markdown report. Result
written to
`reports/context-bloat-forensics/2026-07-27-cbf-smoke.md`.

Findings: none, correctly - the audited transcript was an ordinary small
task with no bloat to find, so an empty findings list is the right answer,
not a wiring gap. The synthesizer correctly refused to invent a finding to
fill the section and instead recorded an out-of-scope observation as an open
question rather than a finding, matching its "do not invent findings" rule.

### Re-verified after the effort-selection retrofit (2026-07-28)

**Status: PASS.** See `EFFORT_SELECTION.md` for the repo-wide rationale. This
workflow's Discover phase now sets `effort: 'low'` (mechanical file
enumeration) and its Synthesize phase now sets `effort: 'high'` (the one
barrier phase, deduplicating findings across every audited file). Re-run
live against a trivial one-line fixture folder
(`/tmp/cbf-smoke-test/journal.jsonl`, a single fake JSON line, outside the
repo). All 4 agents completed, Discover -> Narrate -> Critique -> Synthesize
all ran in order, all three schemas validated, and the synthesizer produced
a well-formed report correctly noting the fixture had no real activity to
find bloat in. Confirms `opts.effort` is accepted by the `agent()` call and
does not break the pipeline's control flow or schema validation.

One caveat worth recording for future maintainers: the first attempt at this
smoke test failed with `agent type 'context-bloat-forensics-discoverer' not
found` - not a bug in the wiring, but because custom subagents defined in
`.claude/agents/` are only picked up at session start (like slash commands),
and these agent files were created mid-session. A fresh session picked them
up immediately and the second attempt passed clean.

This tool has not yet been run against a real, sizeable transcript folder
(a genuine multi-file Workflow run with an oversized input or real
duplication) - that is the next real-world test, once such a run's
transcripts are available to point it at.

### Re-verified after the schema-description retrofit (2026-07-28)

**Status: PASS.** See `SCHEMA_DESIGN.md` for the repo-wide rationale. This
workflow's four enum schema fields (`DISCOVERY_SCHEMA.files[].kind`,
`TIMELINE_SCHEMA.readMode`, `TIMELINE_SCHEMA.events[].type`,
`CRITIQUE_SCHEMA.findings[].severity`) now carry a `description` stating the
calibration between their listed values, instead of just the bare enum.
Re-run live via the Workflow tool against a fresh trivial one-line fixture
folder (`/tmp/cbf-smoke-test-2/journal.jsonl`, a single fake JSON line,
outside the repo). All 4 agents completed, Discover -> Narrate -> Critique
-> Synthesize ran in order, all three schemas (now carrying the new
`description` fields) validated on the first attempt with no SDK rejection
or retry, and the enum values the subagents chose (`kind: "workflow-journal"`,
`readMode: "full"`, event `type: "command_invoked"` / `"unclear"`) matched
the new descriptions' calibration criteria. Confirms `description` on an
`enum` schema field is accepted by the `agent()` call and does not break the
pipeline's control flow or existing schema validation.

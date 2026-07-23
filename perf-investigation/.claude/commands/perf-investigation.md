---
description: Investigate a performance symptom - hypothesize hotspots across five independent lenses, gather evidence for each, and produce a ranked report with a proposed fix and expected gain per issue
argument-hint: [description of the slow endpoint/job/symptom, optionally with known metrics or a profiling excerpt - defaults to asking what to investigate]
---

Investigate this performance symptom: $ARGUMENTS

1. Determine the target to investigate:
   - If `$ARGUMENTS` describes a symptom (a slow endpoint, job, page, or operation) and/or names files or paths, use that description plus any code you can read at the named paths as the target.
   - If `$ARGUMENTS` includes known metrics (latency numbers, profiling output, resource usage graphs described in text), include them as context.
   - If `$ARGUMENTS` is empty, ask the user what is slow and where (endpoint, job, code path) before proceeding - do not guess a target.

2. Call the Workflow tool now, as an actual tool call (not a description of one), with:
   - `scriptPath`: `.claude/workflows/perf-investigation.js`
   - `args`: a JSON object literal `{ "target": "<the symptom description plus relevant code/paths>", "context": "<known metrics, profiling notes, or load characteristics, if known>" }` (an actual object in the tool call payload, NOT a JSON-encoded string).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

3. When it returns, show the user the `report` field directly. Mention the raw counts too: how many hypotheses were raised across all five lenses (`allHypotheses.length`) versus how many survived evidence-gathering (`surviving.length`), so the user knows how much speculation was filtered out before the ranked report.

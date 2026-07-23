# Perf Investigation

Investigates a reported performance symptom (a slow endpoint, job, or operation) by fanning out five independent hotspot-hypothesis lenses (algorithmic complexity, I/O/database, concurrency/contention, memory/GC, infra/deployment), independently gathering evidence for or against every hypothesis they raise, and synthesizing what survives into one ranked report with a concrete fix and an expected gain per issue.

This is BACKLOG.md item 7, built to the same anatomy and quality bar as `prd-generator/` (the canonical template), and structurally mirrors `code-review/` and `security-audit/`'s adversarial-lens pattern, applied here to performance hotspots instead of correctness or security defects.

## Pipeline

```
Scope (1 agent)
  -> Hypothesize (5 agents in parallel: algorithmic, I/O/database, concurrency, memory/GC, infra/deployment)
    -> Evidence (1 agent per hypothesis, in parallel, independent of the lens that raised it)
      -> Report (1 agent, ranks by impact, deduplicates overlapping hypotheses, proposes a fix and expected gain for each)
```

The Hypothesize and Evidence stages are pipelined per lens, not run behind one big barrier: the algorithmic lens's hypotheses start evidence-gathering as soon as that lens finishes, without waiting for the (potentially slower) infra lens to also finish. Wall-clock time is bounded by the slowest single lens-plus-its-evidence-gathering chain, not the sum of every stage.

## Why five independent lenses instead of one investigator

A single agent asked to "find what's slow" gravitates toward whatever category it already has intuitions about (usually algorithmic complexity or an obvious N+1 query) and under-weights the rest - particularly concurrency/contention and infra/deployment misconfiguration, which require reading a different kind of evidence (locks, pool sizes, autoscaling config) than a code-shape scan surfaces. Five agents, each restricted to one hotspot category with an explicit "what you do not do" section, cannot skip their assigned concern and cannot bleed into another lens's territory - the algorithmic lens is not allowed to comment on connection pool exhaustion, the infra lens is not allowed to flag an O(n^2) loop in detail. That separation mirrors `security-audit`'s five-lens design, applied to performance categories instead of attack surfaces.

## Why evidence-gather every hypothesis instead of trusting the lens

Lenses are instructed to hypothesize from code shape alone, which is exactly the failure mode that produces plausible-sounding but wrong performance claims (a loop that "looks" quadratic but is bounded to a fixed small size, a query that "looks" like an N+1 but is already batched two lines up). The `perf-investigation-evidence-gatherer` agent is spawned once per hypothesis, is blind to which lens raised it, and is explicitly told to default to skepticism and re-locate the mechanism in the real target before agreeing with it - rejecting it outright if the mechanism is not actually present or not reachable at meaningful scale. This is the same adversarial-verify pattern used in `code-review`, `bug-hunter`, and `security-audit`, with three verdict tiers (`confirmed`, `plausible`, `rejected`) instead of two, because performance impact is often genuinely uncertain without real profiling data - forcing a binary confirmed/rejected call would either overstate confidence or discard real-but-unquantifiable hypotheses.

## Files

- `.claude/agents/perf-investigation-scoper.md` - maps affected paths, known metrics, load characteristics, and existing instrumentation so five lenses do not each re-derive the same context.
- `.claude/agents/perf-investigation-algorithmic-lens.md` - algorithmic complexity and data-structure choice: quadratic-or-worse loops, wrong data structure for the access pattern, redundant recomputation. Distilled from `experts/software-developer.md`'s data structures/algorithms fundamentals.
- `.claude/agents/perf-investigation-io-lens.md` - I/O, network, and database access patterns: N+1 queries, missing indexes, blocking calls, chatty external APIs, missing caching. Distilled from `experts/software-developer.md` and `experts/software-architect.md`'s data/API design notes.
- `.claude/agents/perf-investigation-concurrency-lens.md` - concurrency and resource contention: missed parallelism, lock contention, pool exhaustion, missing backpressure. Distilled from `experts/software-architect.md`'s resilience-pattern and distributed-consistency knowledge.
- `.claude/agents/perf-investigation-memory-lens.md` - memory growth and GC pressure: leaks, unbounded caches, excessive per-request allocation, large object retention. Distilled from `experts/software-developer.md`'s systems fundamentals.
- `.claude/agents/perf-investigation-infra-lens.md` - deployment and infrastructure configuration: under-provisioning, missing caching/CDN, cold starts, autoscaling and timeout misconfiguration. Distilled from `experts/devops-engineer.md`'s observability, platform, and FinOps knowledge.
- `.claude/agents/perf-investigation-evidence-gatherer.md` - the independent evidence-gatherer, spawned once per hypothesis.
- `.claude/agents/perf-investigation-reporter.md` - deduplicates, ranks by impact, and proposes a fix with expected gain for surviving hypotheses.
- `.claude/workflows/perf-investigation.js` - the orchestration script: Scope sequentially, Hypothesize/Evidence pipelined per lens, Report sequentially.
- `.claude/commands/perf-investigation.md` - the `/perf-investigation [symptom]` entry point. Resolves the symptom description and any known metrics, calls the workflow, and surfaces the report plus raw-vs-surviving hypothesis counts.

## Usage

```
/perf-investigation "the /search endpoint takes 3-8s under load, see src/routes/search.js"
/perf-investigation "checkout job times out at high traffic, p99 latency graph shows a step increase past 200 concurrent users"
```

With no argument the command asks the user what is slow and where before proceeding, rather than guessing a target.

## Dependency note

Independently runnable with a trivial or mock target, same as `code-review` and `security-audit`. No dependency on another workflow's output. Real usage benefits from actual profiling data or metrics in the `context` field, but the workflow still runs (with lower-confidence, code-shape-only hypotheses) without it - the evidence-gatherer's three-tier verdict (`confirmed`/`plausible`/`rejected`) and the reporter's `estimatedGain: "unknown, would need profiling data to quantify"` fallback exist specifically to represent that honestly rather than inventing numbers.

## Smoke test

**Status: PASS.** Recorded here per the project's Definition of Done.

Per the working-directory-scoping fix established in earlier iterations (Claude Code's subagent discovery walks up from the session's cwd, not down into subdirectories), the smoke test ran from a headless session (`claude -p ... --dangerously-skip-permissions`) with its working directory set to `perf-investigation/`. A trivial, self-contained scratch scenario was planted on disk (`perf-investigation/.smoke-scratch/search.js`): a `searchUsers(users, query)` function containing a real, deliberately planted O(n^2) dedup scan (`seen.includes()` on a plain array instead of a `Set`) and a sequential, unbatched per-match `await fetchProfile(user.id)` call inside the loop.

The `Workflow` tool was called directly with `scriptPath: ".claude/workflows/perf-investigation.js"` and:

```json
{"target": "The /search endpoint is slow under load, see .smoke-scratch/search.js searchUsers function.", "context": "smoke-test scratch scenario for the perf-investigation workflow; real on-disk code, no profiling data available"}
```

**Result:** the full pipeline ran end-to-end (scoper -> 5 parallel lenses -> per-hypothesis independent evidence-gathering -> reporter) with no errors observed in the transcript, and every schema validated.

- `allHypotheses.length`: 7 (the algorithmic, io_database, concurrency, and memory_gc lenses each raised real hypotheses; three of them - a sequential/unbatched `fetchProfile` call - were independently flagged by algorithmic, io_database, and concurrency lenses from their own angle, which the reporter later merged; infra_deployment correctly found nothing, since the scratch file has no deployment/config content).
- `surviving.length`: 6. The evidence-gatherer independently re-located the mechanisms in the real on-disk file and confirmed 5 of them (the O(n^2) `seen.includes()` scan, the three independent framings of the sequential `fetchProfile` call, and a low-priority per-request allocation-churn hypothesis), marked 1 as `plausible` (missing cross-request caching for `fetchProfile`, since traffic pattern can't be verified from an isolated file), and correctly `rejected` 1 speculative hypothesis (an "unbounded fan-out could saturate a connection pool" claim from the concurrency lens, since no parallelization exists anywhere in the code to saturate anything with).
- The reporter correctly deduplicated: it merged the three independent "sequential fetch" findings (raised separately by the algorithmic, io_database, and concurrency lenses) into one top-ranked issue naming all three framings, then ranked the O(n²) scan second, the unverified caching opportunity third (explicitly marked lower-confidence), and the low-priority allocation churn last - proposing a concrete fix for each (batch or `Promise.all` the profile fetches; replace the linear scan with a `Set`; add a TTL/LRU cache) and honestly noting that all "expected gain" figures are asymptotic/qualitative rather than measured, since no real profiling data or traffic volume was available.

This confirms the required wiring fact (command -> workflow -> agents path works, every structured agent output validated against its schema) and additionally confirms the evidence-gatherer is not a rubber stamp: it correctly rejected one plausible-sounding but unsupported hypothesis instead of confirming everything it was handed. `.smoke-scratch/` was deleted after the run; `git status` is clean of scratch artifacts.

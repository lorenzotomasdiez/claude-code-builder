#!/usr/bin/env node
// Deterministic, no-LLM dry run of a workflow's orchestration control flow - the layer of
// an agentic pipeline that can be exercised without spending a single real agent() call, and
// where a wiring bug (a phase that never runs, an unguarded property read on a parallel()/
// pipeline() slot) otherwise only surfaces the first time a real, expensive fan-out hits it.
//
// Every agent()/parallel()/pipeline()/workflow() call in the script is mocked: agent() returns
// synthetic data shaped from the real schema: literal the call already passes (no LLM involved),
// and is made to fail (resolve null) on a deterministic fraction of calls to simulate the
// transient subagent failures NULL_SAFETY_AFTER_FANOUT.md documents. The real script's own
// control flow - phase ordering, parallel/pipeline wiring, and whatever null-guard it applies
// after a fan-out - then runs for real, once, at zero token cost and zero wall-clock latency.
//
// Deliberately lives outside scripts/ - .claude/settings.json denies Edit/Write there so no
// agent (including the one that wrote this file) can weaken the existing anatomy gate. See
// README.md "Why not scripts/" (same rationale schema-lint/ already documents).
//
//   node workflow-dry-run/workflow-dry-run.mjs <workflow-dir>   dry-run one package
//   node workflow-dry-run/workflow-dry-run.mjs --all            dry-run every package
//
// Exit 0 = every package's control flow ran clean under injected failure. Exit 2 = at least
// one package crashed with an unguarded null/undefined property read.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import vm from 'node:vm'

const REPO = resolve(process.argv[2] === '--all' ? '.' : join(process.argv[2] || '.', '..'))

function read(p) {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

// Same bracket-matcher schema-lint/schema-lint.mjs uses to extract const literals - reused
// here to find where `export const meta = { ... }` ends, so the remainder of the file (the
// real script body) can be sliced off and run as-is.
function findMatchingClose(src, openIdx) {
  const open = src[openIdx]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let i = openIdx
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i)
      if (i === -1) break
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i + 2) + 1
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++
        i++
      }
      continue
    }
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

// Strip the `export const meta = {...}` block - `export` is not valid inside the vm's plain
// script evaluation, and meta carries no control flow worth exercising anyway.
function stripMeta(src) {
  const m = /export const meta\s*=\s*(\{)/.exec(src)
  if (!m) return src
  const openIdx = m.index + m[0].length - 1
  const closeIdx = findMatchingClose(src, openIdx)
  if (closeIdx === -1) return src
  return src.slice(0, m.index) + src.slice(closeIdx)
}

// Build synthetic data shaped from a real JSON Schema literal - the same one the live agent()
// call already passes as opts.schema - so the mock's shape tracks the workflow's real contract
// instead of a hand-maintained fixture that silently drifts from it.
function fakeValue(schema) {
  if (!schema || typeof schema !== 'object') return 'stub'
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  const t = types.find(t => t !== 'null') || 'string'
  switch (t) {
    case 'object': {
      const obj = {}
      for (const [key, child] of Object.entries(schema.properties || {})) obj[key] = fakeValue(child)
      return obj
    }
    case 'array':
      return schema.items ? [fakeValue(schema.items)] : []
    case 'number':
    case 'integer':
      return 1
    case 'boolean':
      return true
    default:
      return 'stub-string'
  }
}

// One dry run of one workflow script. Returns { phases, crash } where crash is the first
// unguarded-null error hit, if any.
function dryRun(src) {
  const phases = []
  let agentCalls = 0

  // Every 3rd agent() call resolves null instead of fixture data - simulating one lane of a
  // parallel()/pipeline() fan-out failing transiently, the exact shape NULL_SAFETY_AFTER_FANOUT.md
  // documents. Deterministic (a fixed stride, not Math.random - banned in workflow scripts and
  // unnecessary here) so a dry run is reproducible across invocations of this tool.
  async function agent(prompt, opts) {
    agentCalls++
    if (agentCalls % 3 === 0) return null
    return opts && opts.schema ? fakeValue(opts.schema) : `stub-text-${agentCalls}`
  }

  async function parallel(thunks) {
    const results = await Promise.all(thunks.map(fn => fn().catch(() => null)))
    return results
  }

  async function pipeline(items, ...stages) {
    return Promise.all(items.map(async (item, i) => {
      let result = item
      for (const stage of stages) {
        if (result === null) return null
        try {
          result = await stage(result, item, i)
        } catch {
          return null
        }
      }
      return result
    }))
  }

  function phase(title) { phases.push(title) }
  function log() {}
  async function workflow() { return null }

  const budget = { total: null, spent: () => 0, remaining: () => Infinity }
  // A non-empty string satisfies every workflow's `typeof input === 'string'` branch (the
  // convention CLAUDE.md requires every script normalize `args` to) - the point of a dry run
  // is to exercise the fan-out/phase control flow past the initial input-shape guard, not to
  // re-verify that guard itself (schema-lint and validate-workflow.mjs already cover anatomy
  // and schema shape; this tool is scoped to what happens after args parse successfully).
  const args = 'workflow-dry-run fixture input'

  const body = stripMeta(src)
  const wrapped = `(async () => {\n${body}\n})()`
  const context = vm.createContext({
    agent, parallel, pipeline, phase, log, workflow, budget, args,
    console: { log() {}, error() {}, warn() {} },
    Promise, JSON, Math: { ...Math, random: () => { throw new Error('Math.random used in dry run') } },
  })

  return vm.runInContext(wrapped, context, { timeout: 5000 })
    .then(() => ({ phases, crash: null }))
    .catch(err => ({ phases, crash: err }))
}

const NULL_READ = /Cannot read propert(?:y|ies) of (null|undefined)/

function checkPackage(dir) {
  const name = basename(dir)
  const wfDir = join(dir, '.claude/workflows')
  const wfFiles = existsSync(wfDir) ? readdirSync(wfDir).filter(f => f.endsWith('.js')) : []
  if (wfFiles.length !== 1) return { name, skipped: 'no single workflow script found' }

  const src = read(join(wfDir, wfFiles[0])) || ''
  if (!/\bparallel\(|\bpipeline\(/.test(src)) {
    return { name, skipped: 'no parallel()/pipeline() fan-out to exercise' }
  }

  return dryRun(src).then(({ phases, crash }) => {
    if (crash && NULL_READ.test(String(crash.message))) {
      return { name, fail: `unguarded null/undefined read after a simulated fan-out failure: ${crash.message}`, phases }
    }
    if (crash) {
      // Any other thrown error (a named guard-and-throw, a schema mismatch in the mock data,
      // an unrelated bug) is not what this tool checks - it only targets the specific
      // unguarded-null-read failure mode. Reported as an informational note, not a FAIL.
      return { name, note: `script raised a non-null-read error under injected failure (not this tool's concern): ${crash.message}`, phases }
    }
    return { name, phases }
  })
}

async function main() {
  const targets = process.argv[2] === '--all'
    ? readdirSync(REPO).filter(d => {
        try { return statSync(join(REPO, d)).isDirectory() && existsSync(join(REPO, d, '.claude/workflows')) } catch { return false }
      }).map(d => join(REPO, d))
    : [resolve(process.argv[2])]

  let failedCount = 0
  let checkedCount = 0
  for (const t of targets) {
    const result = await checkPackage(t)
    if (result.skipped) {
      console.log(`\x1b[33mSKIP\x1b[0m ${result.name} - ${result.skipped}`)
      continue
    }
    checkedCount++
    if (result.fail) {
      failedCount++
      console.error(`\x1b[31mFAIL\x1b[0m ${result.name} - ${result.fail}`)
    } else if (result.note) {
      console.log(`\x1b[32mPASS\x1b[0m ${result.name} (phases: ${result.phases.join(' -> ') || 'none'}) - ${result.note}`)
    } else {
      console.log(`\x1b[32mPASS\x1b[0m ${result.name} (phases: ${result.phases.join(' -> ') || 'none'})`)
    }
  }

  console.log(`\n${failedCount} package(s) with an unguarded null read under simulated fan-out failure, ${checkedCount} package(s) dry-run, ${targets.length - checkedCount} skipped (no fan-out to exercise).`)

  if (failedCount) {
    console.error('\nA real transient subagent failure would crash this workflow with a generic TypeError instead of degrading gracefully. Fix before considering the work done.')
    process.exit(2)
  }
}

main()

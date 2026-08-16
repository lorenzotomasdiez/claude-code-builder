#!/usr/bin/env node
// A read-only viewer for Claude Code workflow runs.
//
// It invents nothing and writes nothing. Every number it shows comes off disk
// from files the harness already produces, which is the whole design: a viewer
// that needed the workflows to cooperate would be a second thing to keep in
// sync, and the first workflow that forgot to emit an event would show up as a
// blank page rather than an honest gap.
//
// There are two sources, and knowing which is which is the only subtle part.
//
//   <project>/<session>/workflows/wf_<id>.json
//     The complete record: workflowName, args, the return value, every log()
//     line, the phase list, and one entry per agent carrying its phase, model,
//     tokens, duration and a preview of both its prompt and its result.
//     Written ONCE, when the run ends. Measured, not assumed: across five runs
//     the file's mtime landed within a second of startTime + durationMs every
//     time. So it is worth everything after the fact and nothing during.
//
//   <project>/<session>/subagents/workflows/wf_<id>/journal.jsonl
//     Appended live, as agents start and return. It carries agentId and the
//     full result payload but no phase and no label, so a live view is coarser
//     than a finished one. That is a real limit, not a bug to work around.
//
// A run is LIVE when its journal directory exists, no wf_<id>.json does yet, AND
// the journal was touched recently. The first two conditions follow from the
// write-once-at-the-end measurement above; the third had to be learned by
// running this: the very first scan reported two live runs that had been dead
// for hours. A session that is interrupted leaves its journal behind and never
// writes a record, so "no record" alone means "did not finish", which is not
// the same as "still going". Those are ABANDONED, and saying so is worth more
// than hiding them - an abandoned run is a run whose result nobody ever saw.
//
// No dependencies, no build step, no node_modules. `node server.mjs` and open
// the port. In a library whose whole point is packages you can copy into
// someone else's repo, a viewer that needs an install is a viewer nobody runs.

import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = process.env.CLAUDE_PROJECTS || join(homedir(), '.claude', 'projects')
const PORT = Number(process.env.PORT || 4610)

// How long a recordless journal can sit untouched before it is called abandoned
// rather than live. Generous on purpose: the longest single gap between agent
// results in a real gated-sdlc run was an opus reviewer reading 21 files, and a
// viewer that flips a running job to "abandoned" because a model was thinking
// is worse than one that takes a few extra minutes to notice a dead one.
const LIVE_WINDOW_MS = 10 * 60 * 1000

// ── reading the disk ─────────────────────────────────────────────────────────

const ls = (dir) => {
  try { return readdirSync(dir, { withFileTypes: true }) } catch { return [] }
}

const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

// A project directory name is the target repo's path with slashes flattened to
// dashes, so the original is not recoverable by string surgery alone - a repo
// named `my-rag` and a directory `my/rag` flatten identically. The last segment
// is what a human recognises, and that is all this is for.
const projectLabel = (slug) => {
  const parts = String(slug).replace(/^-/, '').split('-')
  return parts.slice(-2).join('-') || slug
}

// Walk <project>/<session>/ once and return both kinds of run in one pass.
// Done together rather than in two scans so a run cannot be seen as finished by
// one scan and live by the other in between.
function scan() {
  const runs = new Map()

  for (const project of ls(ROOT)) {
    if (!project.isDirectory()) continue
    const projectDir = join(ROOT, project.name)

    for (const session of ls(projectDir)) {
      if (!session.isDirectory()) continue
      const sessionDir = join(projectDir, session.name)

      // The finished records.
      for (const f of ls(join(sessionDir, 'workflows'))) {
        if (!f.isFile() || !f.name.startsWith('wf_') || !f.name.endsWith('.json')) continue
        const id = f.name.slice(0, -5)
        runs.set(id, {
          id,
          recordPath: join(sessionDir, 'workflows', f.name),
          journalDir: join(sessionDir, 'subagents', 'workflows', id),
          project: project.name,
          projectLabel: projectLabel(project.name),
          session: session.name,
          live: false,
        })
      }

      // The recordless ones: still going, or died without finishing.
      for (const d of ls(join(sessionDir, 'subagents', 'workflows'))) {
        if (!d.isDirectory() || !d.name.startsWith('wf_')) continue
        if (runs.has(d.name)) continue
        const journalDir = join(sessionDir, 'subagents', 'workflows', d.name)
        // The NEWEST mtime in the directory, not the journal's.
        //
        // The journal is appended only when an agent starts or returns, so a
        // phase with one long-running agent leaves it untouched for as long as
        // that agent takes. A builder was 81 minutes into its turn, writing to
        // its own transcript 20 seconds ago, while the journal had not moved
        // since the phase began - and this viewer called it abandoned. The
        // agent transcripts are where a live run actually breathes.
        let touched = null
        for (const f of ls(journalDir)) {
          if (!f.isFile()) continue
          try {
            const m = statSync(join(journalDir, f.name)).mtimeMs
            if (touched === null || m > touched) touched = m
          } catch {}
        }
        runs.set(d.name, {
          id: d.name,
          recordPath: null,
          journalDir,
          project: project.name,
          projectLabel: projectLabel(project.name),
          session: session.name,
          live: touched !== null && Date.now() - touched < LIVE_WINDOW_MS,
          touched,
        })
      }
    }
  }
  return [...runs.values()]
}

// The journal is the live half. Every agent that has started appears; the ones
// that have returned carry their payload. `meta.json` beside it names the agent
// type and model, which the journal itself does not.
function readJournal(dir) {
  const agents = new Map()
  const order = []

  for (const f of ls(dir)) {
    const m = f.name.match(/^agent-([a-z0-9]+)\.meta\.json$/)
    if (!m) continue
    const meta = readJson(join(dir, f.name)) || {}
    agents.set(m[1], { agentId: m[1], agentType: meta.agentType || null, model: meta.model || null })
  }

  let text = ''
  try { text = readFileSync(join(dir, 'journal.jsonl'), 'utf8') } catch { return { agents: [], mtime: null } }

  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    const id = row.agentId
    if (!id) continue
    if (!agents.has(id)) agents.set(id, { agentId: id, agentType: null, model: null })
    const a = agents.get(id)
    if (row.type === 'started') { a.state = a.state || 'running'; if (!order.includes(id)) order.push(id) }
    if (row.type === 'result') {
      a.state = 'done'
      a.result = row.result
      if (!order.includes(id)) order.push(id)
    }
  }

  // The journal has no timestamps, so the agent transcript's mtime is the only
  // clock available live. Good enough to answer "is this one still going".
  for (const [id, a] of agents) {
    const p = join(dir, `agent-${id}.jsonl`)
    try { a.lastActivity = statSync(p).mtimeMs } catch { a.lastActivity = null }
  }

  const ordered = order.map(id => agents.get(id)).filter(Boolean)
  for (const a of agents.values()) if (!ordered.includes(a)) ordered.push(a)

  let mtime = null
  try { mtime = statSync(join(dir, 'journal.jsonl')).mtimeMs } catch {}
  return { agents: ordered, mtime }
}

// A probe's payload IS the gate result: one row per check, each with the exit
// status and the verbatim output. Pulling them up to the top level is what lets
// the UI show a failing check without anyone re-deriving it.
const checksOf = (payload) => {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload.checks
  if (!Array.isArray(raw)) return null
  return raw.map(c => ({ id: c.id, ok: Boolean(c.ok), observed: String(c.observed ?? '') }))
}

const parseMaybe = (v) => {
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return null }
}

// Every tool call one agent made, with what it was given and what came back.
//
// This is the layer the run record does not have. `workflow_agent` carries a
// `toolCalls` count and nothing else, which tells you an agent did 26 things
// and not one of them. For a probe the calls ARE the evidence - the exact shell
// commands the script composed - and for a builder they are the difference
// between "wrote 14 files" and knowing which.
//
// Read on demand, per agent, never in the bulk detail: these transcripts run to
// half a megabyte and there are twenty of them in a run.
function toolCalls(dir, agentId) {
  let text = ''
  try { text = readFileSync(join(dir, `agent-${agentId}.jsonl`), 'utf8') } catch { return null }

  const calls = []
  const byId = new Map()

  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    const content = row.message && row.message.content
    if (!Array.isArray(content)) continue

    for (const b of content) {
      if (b.type === 'tool_use') {
        const call = {
          id: b.id,
          name: b.name,
          input: b.input,
          at: row.timestamp || null,
          result: null,
          isError: false,
        }
        calls.push(call)
        byId.set(b.id, call)
      }
      if (b.type === 'tool_result') {
        const call = byId.get(b.tool_use_id)
        if (!call) continue
        const v = b.content
        const asText = typeof v === 'string' ? v : JSON.stringify(v)
        // Truncated here rather than in the browser: the point is to see what a
        // command returned, and the tail of a 3000-line file listing is not it.
        // The full bytes are in the transcript for anyone who needs them.
        call.result = asText == null ? null : asText.slice(0, 4000)
        call.truncated = asText != null && asText.length > 4000
        call.isError = Boolean(b.is_error)
      }
    }
  }
  return calls
}

// ── shaping a run for the client ─────────────────────────────────────────────

function summarize(run) {
  const base = {
    id: run.id,
    project: run.projectLabel,
    projectSlug: run.project,
    session: run.session,
    live: run.live,
  }

  if (!run.recordPath) {
    const { agents, mtime } = readJournal(run.journalDir)
    const done = agents.filter(a => a.state === 'done').length
    return {
      ...base,
      workflow: null,
      // No record was ever written, so the harness never reached the end of
      // this run. Live or abandoned, but never "completed".
      status: run.live ? 'running' : 'abandoned',
      startTime: agents.length ? Math.min(...agents.map(a => a.lastActivity || mtime).filter(Boolean)) : mtime,
      durationMs: null,
      agentCount: agents.length,
      agentsDone: done,
      totalTokens: null,
      // `run.touched` for the same reason liveness uses it: the journal stands
      // still while one agent works, so its mtime reads as an hour of silence
      // during an hour of work.
      lastActivity: run.touched || mtime,
    }
  }

  const r = readJson(run.recordPath)
  if (!r) return { ...base, workflow: null, status: 'unreadable', broken: true }

  const args = parseMaybe(r.args)
  const result = parseMaybe(r.result)
  return {
    ...base,
    workflow: r.workflowName || null,
    status: r.status || 'unknown',
    accepted: result && typeof result.accepted === 'boolean' ? result.accepted : null,
    startTime: r.startTime || null,
    durationMs: r.durationMs ?? null,
    agentCount: r.agentCount ?? null,
    agentsDone: r.agentCount ?? null,
    totalTokens: r.totalTokens ?? null,
    totalToolCalls: r.totalToolCalls ?? null,
    request: (args && (args.request || args.task)) || null,
    runId: (args && args.runId) || null,
  }
}

function detail(run) {
  const summary = summarize(run)

  // Live: the journal is all there is. No phases, no labels - the harness knows
  // them but only writes them at the end. Said plainly here rather than faked.
  if (!run.recordPath) {
    const { agents } = readJournal(run.journalDir)
    return {
      ...summary,
      partial: true,
      partialReason: run.live
        ? 'This run is still going. Only the journal exists yet, and it carries no phase or ' +
          'label - the harness writes those once, when the run ends. Agent type, model and ' +
          'every gate check below are real; the grouping into phases is not available live.'
        : 'This run never finished. Its journal is on disk but no record was ever written, ' +
          'which means the session ended before the workflow did - killed, crashed, or closed. ' +
          'What the agents did up to that point is real; there is no verdict, because none was ' +
          'ever reached.',
      phases: [],
      agents: agents.map(a => ({
        agentId: a.agentId,
        label: null,
        phaseTitle: null,
        agentType: a.agentType,
        model: a.model,
        state: a.state || 'running',
        tokens: null,
        durationMs: null,
        checks: checksOf(a.result),
        resultPreview: a.result ? JSON.stringify(a.result).slice(0, 400) : null,
      })),
      logs: [],
      gates: [],
      commits: [],
    }
  }

  const r = readJson(run.recordPath)
  if (!r) return { ...summary, broken: true }
  const result = parseMaybe(r.result) || {}

  // Agents come from workflowProgress, which carries the phase mapping. Their
  // full payloads come from the journal, because the record keeps only a
  // truncated preview and a truncated gate result is a gate result nobody can
  // check.
  const { agents: live } = readJournal(run.journalDir)
  const byId = new Map(live.map(a => [a.agentId, a]))

  const agents = (r.workflowProgress || [])
    .filter(e => e.type === 'workflow_agent')
    .map(e => {
      const j = byId.get(e.agentId)
      const payload = j && j.result
      return {
        agentId: e.agentId,
        label: e.label || null,
        phaseTitle: e.phaseTitle || null,
        phaseIndex: e.phaseIndex ?? null,
        agentType: e.agentType || null,
        model: e.model || null,
        state: e.state || null,
        attempt: e.attempt ?? null,
        tokens: e.tokens ?? null,
        toolCalls: e.toolCalls ?? null,
        durationMs: e.durationMs ?? null,
        checks: checksOf(payload),
        summary: payload && typeof payload === 'object' ? payload.summary || null : null,
        resultPreview: payload ? JSON.stringify(payload).slice(0, 2000) : (e.resultPreview || null),
        promptPreview: e.promptPreview || null,
      }
    })

  const phases = (r.workflowProgress || [])
    .filter(e => e.type === 'workflow_phase')
    .map(e => ({
      index: e.index,
      title: e.title,
      detail: (r.phases || []).find(p => p.title === e.title)?.detail || null,
      agents: agents.filter(a => a.phaseIndex === e.index).map(a => a.agentId),
    }))

  return {
    ...summary,
    partial: false,
    phases,
    agents,
    logs: Array.isArray(r.logs) ? r.logs : [],
    // `phases` inside the return value is the workflow's own record of what it
    // did, which is a different thing from the harness's phase list above: this
    // one is what the script decided, that one is what the display showed.
    reported: Array.isArray(result.phases) ? result.phases : [],
    gates: Array.isArray(result.gates) ? result.gates : [],
    commits: Array.isArray(result.commits) ? result.commits : [],
    accepted: typeof result.accepted === 'boolean' ? result.accepted : null,
    reason: result.reason || null,
    uncommitted: Array.isArray(result.uncommitted) ? result.uncommitted : [],
    script: typeof r.script === 'string' ? r.script : null,
    scriptPath: r.scriptPath || null,
    defaultModel: r.defaultModel || null,
  }
}

// ── the server ───────────────────────────────────────────────────────────────

const send = (res, code, body, type = 'application/json') => {
  const payload = type === 'application/json' ? JSON.stringify(body) : body
  res.writeHead(code, {
    'content-type': `${type}; charset=utf-8`,
    'cache-control': 'no-store',
  })
  res.end(payload)
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  try {
    if (path === '/api/runs') {
      const all = scan().map(summarize)
      // Live first, then newest. A run you are watching should never be below
      // the fold behind a hundred finished ones.
      all.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || (b.startTime || 0) - (a.startTime || 0))
      const workflow = url.searchParams.get('workflow')
      return send(res, 200, {
        runs: workflow ? all.filter(r => r.workflow === workflow) : all,
        workflows: [...new Set(all.map(r => r.workflow).filter(Boolean))].sort(),
        root: ROOT,
      })
    }

    const tools = path.match(/^\/api\/runs\/(wf_[A-Za-z0-9-]+)\/agents\/([a-z0-9]+)\/tools$/)
    if (tools) {
      const run = scan().find(r => r.id === tools[1])
      if (!run) return send(res, 404, { error: `no run ${tools[1]}` })
      const calls = toolCalls(run.journalDir, tools[2])
      if (!calls) return send(res, 404, { error: `no transcript for agent ${tools[2]}` })
      return send(res, 200, { calls })
    }

    const m = path.match(/^\/api\/runs\/(wf_[A-Za-z0-9-]+)$/)
    if (m) {
      const run = scan().find(r => r.id === m[1])
      if (!run) return send(res, 404, { error: `no run ${m[1]}` })
      return send(res, 200, detail(run))
    }

    if (path === '/' || path === '/index.html') {
      return send(res, 200, readFileSync(join(HERE, 'public', 'index.html'), 'utf8'), 'text/html')
    }

    return send(res, 404, { error: 'not found' })
  } catch (err) {
    // A viewer that 500s silently is worse than one that says what broke: the
    // whole point is to be able to trust what is on the screen.
    return send(res, 500, { error: String(err && err.message || err) })
  }
})

server.listen(PORT, () => {
  const runs = scan()
  const live = runs.filter(r => r.live).length
  console.log(`workflow obs  http://localhost:${PORT}`)
  console.log(`reading       ${ROOT}`)
  console.log(`found         ${runs.length} run(s)${live ? `, ${live} live` : ''}`)
})

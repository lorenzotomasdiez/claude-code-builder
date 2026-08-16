#!/usr/bin/env node
// PreToolUse hook: the gated-sdlc write boundary, enforced BEFORE the write.
//
// Wire it into the target repo's .claude/settings.json:
//
//   "hooks": {
//     "PreToolUse": [
//       { "matcher": "Write|Edit|NotebookEdit",
//         "hooks": [{ "type": "command",
//                     "command": "node .claude/hooks/gated-write-boundary.mjs" }] }
//     ]
//   }
//
// Exit 2 blocks the tool call and feeds stderr back to the agent as the reason.
// Exit 0 means "no opinion" and normal permission flow continues.
//
// ── Why this exists alongside settle() in the workflow script ────────────────
//
// The script's settle() detects a breach AFTER the write landed and rolls it
// back. This stops it landing. Both are kept on purpose, because they fail in
// opposite directions:
//
//   - This hook does nothing if it is not installed, or if `agent_type` is not
//     populated for subagents spawned inside a Workflow run. It would then be
//     a hook that looks armed and enforces nothing - see scripts/hook-selftest.mjs
//     in the claude-workflows repo for two real precedents of exactly that.
//   - settle() cannot prevent anything, and costs a model call to observe.
//
// Until a real run proves this hook fires for Workflow subagents, settle() is
// the layer actually holding the line. Do not delete it on the strength of
// this file existing.
//
// ── Scope ────────────────────────────────────────────────────────────────────
//
// This hook ONLY has an opinion when the caller is a gated-sdlc agent, i.e.
// `agent_type` starts with "gated-". Any other caller - a human's session, a
// different workflow's subagent, an agent with no agent_type at all - is none
// of its business and gets exit 0. A hook installed in a repo must not change
// what that repo's normal work is allowed to do.

import { readFileSync } from 'node:fs'
import { relative, isAbsolute, resolve, sep } from 'node:path'

// ─── The boundary. Mirrors WRITES/PROTECTED in .claude/workflows/gated-sdlc.js ─
// scripts/hook-boundary-selftest.mjs asserts the two stay identical - if you
// change one, that test fails until you change the other.

const WRITES = {
  'gated-framer': [],
  'gated-planner': ['specs/', 'HANDOFF/'],
  'gated-reviewer': [],
  'gated-documenter': ['docs/', '*.md', '**/*.md'],
  'gated-builder': null,
}
const PROTECTED = ['.claude/workflows/', '.claude/agents/', '.claude/commands/', 'CLAUDE.md']

// `*` stops at a path separator; `**` is how you say "cross directories".
function matches(path, pattern) {
  if (pattern.endsWith('/')) return path.startsWith(pattern)
  let out = '', i = 0
  while (i < pattern.length) {
    if (pattern.startsWith('**', i)) { out += '.*'; i += 2 }
    else if (pattern[i] === '*') { out += '[^/]*'; i += 1 }
    else if (pattern[i] === '?') { out += '[^/]'; i += 1 }
    else { out += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); i += 1 }
  }
  return new RegExp(`^${out}$`).test(path)
}

// PROTECTED first: an allow list is a widening, a protected path is a floor,
// and a widening must never be evaluated before the floor. The documenter's
// `**/*.md` reaches `.claude/agents/*.md` exactly, so this order is the rule.
export function permitted(path, agentType) {
  if (PROTECTED.some(p => matches(path, p))) return false
  const allow = WRITES[agentType]
  if (path.startsWith('.claude/runs/')) return true
  if ((allow || []).some(p => matches(path, p))) return true
  return allow === null
}

// ─── Hook plumbing ────────────────────────────────────────────────────────────

// Fail OPEN on anything unexpected. A hook that crashes on a payload shape it
// did not anticipate would block every write in the repo, which is a far worse
// failure than missing one breach that settle() will catch anyway.
function main() {
  let payload
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return 0
  }

  const agentType = payload && payload.agent_type
  if (typeof agentType !== 'string' || !agentType.startsWith('gated-')) return 0
  if (!Object.prototype.hasOwnProperty.call(WRITES, agentType)) return 0

  const filePath = payload.tool_input && payload.tool_input.file_path
  if (typeof filePath !== 'string' || !filePath) return 0

  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  let rel = isAbsolute(filePath) ? relative(cwd, filePath) : filePath
  rel = rel.split(sep).join('/')

  // Outside the repo entirely: not a path this boundary describes, and not a
  // judgement this hook is equipped to make. settle() only sees the working
  // tree, so it would miss this too - flagged here rather than silently allowed.
  if (rel.startsWith('../') || isAbsolute(rel)) {
    process.stderr.write(
      `gated-sdlc: ${agentType} tried to write outside the repository: ${filePath}\n` +
      `No agent in this pipeline has a reason to. Write inside the repo, or into the run's handoff dir.\n`)
    return 2
  }

  if (permitted(rel, agentType)) return 0

  const allow = WRITES[agentType]
  const where = allow === null ? 'anywhere except the protected paths'
    : allow.length ? allow.join(', ')
    : 'nothing in the repo - it is a read-only phase'

  process.stderr.write(
    `gated-sdlc: ${agentType} is not allowed to write ${rel}.\n` +
    `It may write: ${where} (plus this run's handoff dir under .claude/runs/).\n` +
    (PROTECTED.some(p => matches(rel, p))
      ? 'That path is protected: no agent in this pipeline edits its own evaluator.\n'
      : 'If the work genuinely requires that path, it belongs to a different phase.\n'))
  return 2
}

// Only run the hook when executed directly, so the self-test can import
// `permitted` without the module reading stdin and exiting.
if (process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`) {
  process.exit(main())
}

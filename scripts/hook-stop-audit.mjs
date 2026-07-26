#!/usr/bin/env node
// Stop hook: refuse to end an unattended run with a broken workflow package.
//
// TERMINATION IS THE WHOLE DESIGN HERE. Stop-hook non-termination is the single
// best-documented failure mode of hook-based enforcement: nine separate upstream issues,
// including one where a Stop hook returning a blocking result looped for ~50 minutes until
// the session quota was exhausted. There is no built-in loop counter; the only backstop is
// the 600s per-command timeout, which does not help a hook that keeps succeeding at blocking.
//
// So this hook blocks AT MOST ONCE PER SESSION. First stop with violations: block, report
// them, let the agent fix. Second stop: report to stderr but exit 0 and let the session end,
// whatever state it is in. One chance to self-correct, then it is the human's problem.
// An overnight run that ends dirty is recoverable; one that burns the quota looping is not.
//
// Fails open on any internal error, same as scripts/hook-validate.mjs.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MARKER_DIR = join(tmpdir(), 'claude-workflows-stop-audit')

function main() {
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return 0
  }

  // Never re-enter on our own blocking result.
  if (payload?.stop_hook_active) return 0

  let violations = ''
  try {
    execFileSync(process.execPath, [join(REPO, 'scripts/validate-workflow.mjs'), '--all'], {
      stdio: 'pipe',
      cwd: REPO,
    })
    return 0 // everything clean
  } catch (e) {
    if (e.status !== 2) return 0 // validator crashed - fail open
    violations = String(e.stderr || '').replace(/\x1b\[\d+m/g, '').trim()
  }

  const sessionId = String(payload?.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '')
  const marker = join(MARKER_DIR, `${sessionId}.blocked`)

  if (existsSync(marker)) {
    // Already blocked once this session. Report and let it end - do not loop.
    process.stderr.write(
      `Workflow quality bar still violated at session end (already flagged once, not blocking again):\n\n${violations}\n`
    )
    return 0
  }

  try {
    mkdirSync(MARKER_DIR, { recursive: true })
    writeFileSync(marker, new Date().toISOString())
  } catch {
    return 0 // cannot record that we blocked - so do not block, or we risk looping
  }

  process.stderr.write(
    `Do not end here. The repository violates its own quality bar:\n\n${violations}\n\n` +
    `Fix these, then stop. Re-check with: node scripts/validate-workflow.mjs --all\n` +
    `(This check blocks only once per session - it will not block again.)\n`
  )
  return 2
}

let code = 0
try {
  code = main()
} catch {
  code = 0
}
process.exit(code)

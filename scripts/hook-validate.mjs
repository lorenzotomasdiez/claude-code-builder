#!/usr/bin/env node
// PostToolUse hook: validate the workflow package that was just edited.
//
// Wired from .claude/settings.json as a bare `node scripts/hook-validate.mjs`.
// Reads the hook payload on stdin, exits 2 with violations on stderr, silent otherwise.
//
// Three properties this file exists to guarantee, each learned the hard way:
//
// 1. NO PIPELINE. The shape from the official docs example - `jq -r '.tool_input.file_path'
//    | xargs node check.mjs` - silently disarms the hook: the script exits 2, the pipeline
//    returns 1, and Claude Code does not treat it as blocking. Measured locally: the
//    violating file survived. There is a matching upstream bug class (exit-2-with-malformed
//    -JSON was silently non-blocking before v2.1.214). One executable, stdin in, exit code
//    out. Run scripts/hook-selftest.mjs after any change here.
//
// 2. FAILS OPEN. If this script throws for any reason of its own, exit 0. A broken harness
//    must stop enforcing, never wedge an unattended overnight run.
//
// 3. SCOPED. Validates only the package containing the edited file, so the cost stays at
//    ~45ms rather than ~200ms for all 24.

import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function main() {
  let payload
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return 0 // no parsable payload - not our business
  }

  const filePath = payload?.tool_input?.file_path
  if (!filePath) return 0

  // Which workflow package does this file belong to?
  const rel = relative(REPO, resolve(filePath))
  if (rel.startsWith('..')) return 0 // outside the repo
  const pkg = rel.split('/')[0]
  if (!pkg || !existsSync(join(REPO, pkg, '.claude/workflows'))) return 0 // not a workflow package

  try {
    execFileSync(process.execPath, [join(REPO, 'scripts/validate-workflow.mjs'), join(REPO, pkg)], {
      stdio: 'pipe',
      cwd: REPO,
    })
    return 0 // clean - stay silent, cost zero tokens
  } catch (e) {
    if (e.status === 2) {
      const detail = String(e.stderr || '').replace(/\x1b\[\d+m/g, '').trim()
      process.stderr.write(
        `Workflow package "${pkg}" violates the quality bar in CLAUDE.md:\n\n${detail}\n\n` +
        `Fix these before moving on. Re-check with: node scripts/validate-workflow.mjs ${pkg}\n`
      )
      return 2
    }
    return 0 // validator crashed rather than found violations - fail open
  }
}

let code = 0
try {
  code = main()
} catch {
  code = 0 // property 2: fail open
}
process.exit(code)

#!/usr/bin/env node
// Validate a workflow package against the anatomy + quality bar in CLAUDE.md.
//
//   node scripts/validate-workflow.mjs <workflow-dir>   validate one package
//   node scripts/validate-workflow.mjs --all            validate every package
//
// Exit 0 = clean. Exit 2 = violations (the exit code hooks use to feed stderr back to the agent).
// Deliberately dependency-free: no package.json, no install step, Node 22 built-ins only.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO = resolve(process.argv[2] === '--all' ? '.' : join(process.argv[2] || '.', '..'))

function read(p) {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

function listMd(dir) {
  try { return readdirSync(dir).filter(f => f.endsWith('.md')) } catch { return [] }
}

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text || '')
  if (!m) return null
  const out = {}
  for (const line of m[1].split('\n')) {
    const k = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
    if (k) out[k[1]] = k[2].trim()
  }
  return out
}

function validate(dir) {
  const name = basename(dir)
  const errs = []
  const err = m => errs.push(m)

  // --- 1. Anatomy -----------------------------------------------------------
  const wfDir = join(dir, '.claude/workflows')
  const agDir = join(dir, '.claude/agents')
  const cmDir = join(dir, '.claude/commands')
  const readmePath = join(dir, 'README.md')

  const wfFiles = existsSync(wfDir) ? readdirSync(wfDir).filter(f => f.endsWith('.js')) : []
  const agFiles = listMd(agDir)
  const cmFiles = listMd(cmDir)

  if (wfFiles.length !== 1) err(`.claude/workflows/ must hold exactly 1 .js orchestration script (found ${wfFiles.length})`)
  if (cmFiles.length !== 1) err(`.claude/commands/ must hold exactly 1 .md slash command (found ${cmFiles.length})`)
  if (agFiles.length < 2) err(`.claude/agents/ must hold at least 2 subagents (found ${agFiles.length})`)
  if (!existsSync(readmePath)) err('README.md is missing')
  if (wfFiles.length === 1 && wfFiles[0] !== `${name}.js`) err(`workflow script should be named ${name}.js (found ${wfFiles[0]})`)
  if (cmFiles.length === 1 && cmFiles[0] !== `${name}.md`) err(`slash command should be named ${name}.md (found ${cmFiles[0]})`)
  if (errs.length && wfFiles.length !== 1) return { name, errs }

  const wfPath = join(wfDir, wfFiles[0])
  const src = read(wfPath) || ''

  // --- 2. Script parses -----------------------------------------------------
  try {
    execFileSync(process.execPath, ['--check', wfPath], { stdio: 'pipe' })
  } catch (e) {
    err(`workflow script is not valid JS: ${String(e.stderr || e).split('\n')[0]}`)
  }

  // --- 3. meta block --------------------------------------------------------
  const metaMatch = /export const meta = \{[\s\S]*?\n\}/.exec(src)
  if (!metaMatch) {
    err('missing `export const meta = {...}` at the top of the workflow script')
  } else {
    const meta = metaMatch[0]
    if (!/\bname:\s*'/.test(meta)) err('meta is missing a `name` field')
    if (!/\bdescription:\s*'/.test(meta)) err('meta is missing a `description` field')
    const declaredName = (/\bname:\s*'([^']+)'/.exec(meta) || [])[1]
    if (declaredName && declaredName !== name) err(`meta.name is '${declaredName}' but the directory is '${name}'`)
    if (/\$\{|\.\.\.|\w+\(/.test(meta.replace(/'[^']*'/g, "''"))) {
      err('meta must be a pure literal - no template interpolation, spreads, or function calls')
    }

    // Every phase string used must be declared in meta.phases.
    const declared = new Set([...meta.matchAll(/title:\s*'([^']+)'/g)].map(m => m[1]))
    const used = new Set([
      ...[...src.matchAll(/\bphase\('([^']+)'\)/g)].map(m => m[1]),
      ...[...src.matchAll(/\bphase:\s*'([^']+)'/g)].map(m => m[1]),
    ])
    for (const p of used) {
      if (!declared.has(p)) err(`phase '${p}' is used in the script but not declared in meta.phases`)
    }
    for (const p of declared) {
      if (!used.has(p)) err(`meta.phases declares '${p}' but no phase() call or {phase:} option uses it`)
    }
  }

  // --- 4. args normalization (semantic, not variable-name) ------------------
  const normalizes = /typeof\s+(\w+)\s*===\s*'string'/.test(src) && /JSON\.parse\(/.test(src)
  if (!normalizes) {
    err('missing the args normalization block - this environment can deliver Workflow args as a JSON-encoded string, so the script must parse it back to an object')
  }

  // --- 5. Every {schema: X} reference resolves to a defined const ------------
  const defined = new Set([...src.matchAll(/^const ([A-Z][A-Z0-9_]*)\s*=/gm)].map(m => m[1]))
  for (const m of src.matchAll(/schema:\s*([A-Z][A-Z0-9_]*)/g)) {
    if (!defined.has(m[1])) err(`agent() references schema \`${m[1]}\` which is never defined in the script`)
  }
  const agentCalls = [...src.matchAll(/\bagent\(/g)].length
  const schemaUses = [...src.matchAll(/schema:\s*[A-Z]/g)].length
  if (agentCalls > 0 && schemaUses === 0) {
    err('no agent() call validates its output against a JSON schema - the quality bar requires schema-validated structured outputs')
  }

  // --- 6. Every agentType resolves to a real agent file ---------------------
  const agentNames = new Set(agFiles.map(f => basename(f, '.md')))
  for (const m of src.matchAll(/agentType:\s*'([^']+)'/g)) {
    if (!agentNames.has(m[1])) err(`agentType '${m[1]}' has no matching .claude/agents/${m[1]}.md`)
  }

  // --- 7. Agent frontmatter -------------------------------------------------
  for (const f of agFiles) {
    const fm = frontmatter(read(join(agDir, f)))
    const stem = basename(f, '.md')
    if (!fm) { err(`agents/${f} has no YAML frontmatter`); continue }
    if (fm.name !== stem) err(`agents/${f} declares name '${fm.name}' - must match the filename`)
    if (!fm.description) err(`agents/${f} has no description`)
    const body = read(join(agDir, f)) || ''
    if (!/what you do not do|you do not|out of scope/i.test(body)) {
      err(`agents/${f} has no explicit "what you do not do" section - required for narrow, non-overlapping roles`)
    }
  }

  // --- 8. Command frontmatter ----------------------------------------------
  if (cmFiles.length === 1) {
    const cmd = read(join(cmDir, cmFiles[0])) || ''
    const fm = frontmatter(cmd)
    if (!fm) err(`commands/${cmFiles[0]} has no YAML frontmatter`)
    else if (!fm.description) err(`commands/${cmFiles[0]} has no description`)
    if (!/Workflow tool/i.test(cmd)) err(`commands/${cmFiles[0]} never instructs the agent to call the Workflow tool`)
    if (!/scriptPath/.test(cmd)) err(`commands/${cmFiles[0]} does not specify a scriptPath`)
  }

  // --- 9. README records a smoke test --------------------------------------
  // DoD rule 3 requires the result recorded; rule 4 allows an honest "blocked, here's why"
  // note instead. Those are different states, so grade them differently: a missing section
  // is a hard failure, an honest not-yet-run note is a tracked warning.
  const readme = read(readmePath) || ''
  let untested = false
  if (readme && !/##\s*Smoke test/i.test(readme)) {
    err('README.md has no "## Smoke test" section - the Definition of Done requires the smoke-test result to be recorded')
  } else if (readme) {
    const section = readme.slice(readme.search(/##\s*Smoke test/i))
    if (/\b(PASS|FAIL)\b/.test(section)) {
      // recorded outcome, nothing to flag
    } else if (/not (yet )?run|wiring verified|blocked/i.test(section)) {
      untested = true
    } else {
      err('README.md smoke-test section records neither a PASS/FAIL result nor an honest not-yet-run note')
    }
  }

  // --- 10. House style ------------------------------------------------------
  const files = [wfPath, readmePath, ...agFiles.map(f => join(agDir, f)), ...cmFiles.map(f => join(cmDir, f))]
  for (const f of files) {
    const t = read(f)
    if (t && t.includes('—')) err(`${f.replace(REPO + '/', '')} contains an em dash - house style is plain dashes`)
  }

  return { name, errs, untested }
}

const targets = process.argv[2] === '--all'
  ? readdirSync(REPO).filter(d => {
      try { return statSync(join(REPO, d)).isDirectory() && existsSync(join(REPO, d, '.claude/workflows')) } catch { return false }
    }).map(d => join(REPO, d))
  : [resolve(process.argv[2])]

let failed = 0
const untestedNames = []
for (const t of targets) {
  const { name, errs, untested } = validate(t)
  if (errs.length) {
    failed++
    console.error(`\x1b[31mFAIL\x1b[0m ${name}`)
    for (const e of errs) console.error(`  - ${e}`)
  } else if (untested) {
    untestedNames.push(name)
    console.log(`\x1b[33mWARN\x1b[0m ${name} - anatomy clean, but never smoke-tested end to end`)
  } else {
    console.log(`\x1b[32mPASS\x1b[0m ${name}`)
  }
}
if (untestedNames.length) {
  console.log(`\n${untestedNames.length}/${targets.length} package(s) have never been smoke-tested: ${untestedNames.join(', ')}`)
}
if (failed) {
  console.error(`\n${failed}/${targets.length} workflow package(s) violate the quality bar. Fix the items above before considering the work done.`)
  process.exit(2)
}

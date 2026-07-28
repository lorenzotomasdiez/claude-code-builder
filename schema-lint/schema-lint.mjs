#!/usr/bin/env node
// Deterministic, no-LLM structural lint for the JSON Schema literals embedded in every
// workflow script - the layer of an agentic pipeline that can be checked without spending
// a single agent() call, and where a subtle bug otherwise only surfaces at the worst possible
// time: mid-fan-out, when the SDK rejects a subagent's structured output against a schema
// that was wrong before the agent ever ran.
//
// Deliberately lives outside scripts/ - .claude/settings.json denies Edit/Write there so no
// agent (including the one that wrote this file) can weaken the existing anatomy gate. This
// is new, additive tooling, not a change to that gate. See README.md "Why not scripts/".
//
//   node schema-lint/schema-lint.mjs <workflow-dir>   lint one package's schemas
//   node schema-lint/schema-lint.mjs --all            lint every package
//
// Exit 0 = no structural errors (warnings may still print). Exit 2 = at least one FAIL.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import vm from 'node:vm'

const REPO = resolve(process.argv[2] === '--all' ? '.' : join(process.argv[2] || '.', '..'))

function read(p) {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

// Find the index just past the character that closes the bracket opened at `openIdx`
// (src[openIdx] is '{' or '['), tracking string/template-literal/comment state so a brace
// inside a string or comment is never mistaken for real structure.
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

// Pull out every top-level `const NAME = { ... }` or `const NAME = [ ... ]` block via real
// bracket matching (not a `\n}`-shaped regex, which mis-extracts on an inline `{}`/multi-line
// string). Schemas reference each other (e.g. FINDINGS_SCHEMA embeds FINDING as `items:
// FINDING`) and some reference sibling array consts (e.g. `enum: SOME_LIST`), so every
// top-level const is extracted and evaluated together, not just ones named *_SCHEMA.
function extractConsts(src) {
  // UPPER_SNAKE_CASE only, matching this repo's own naming convention for schema literals
  // and their fragments (BRIEF_SCHEMA, FINDING, LENSES, DOC_TYPES...). Excluding camelCase
  // runtime bindings (`blueprint`, `priorSlices`) at extraction time, not just at closure
  // time, avoids a real false-positive: a schema property key can share a bare word with an
  // unrelated runtime const (e.g. BLUEPRINT_SCHEMA's `slices` property vs. a `const slices =
  // [...blueprint.slices]` a few lines below it), which a text-based reference scan alone
  // cannot tell apart from a real dependency.
  const re = /^const ([A-Z][A-Z0-9_]*)\s*=\s*([{[])/gm
  const blocks = []
  let m
  while ((m = re.exec(src))) {
    const openIdx = m.index + m[0].length - 1
    const closeIdx = findMatchingClose(src, openIdx)
    if (closeIdx === -1) continue
    blocks.push({ name: m[1], text: `const ${m[1]} = ${src.slice(openIdx, closeIdx)}` })
  }
  return blocks
}

// Only evaluate the transitive closure of consts a schema root actually references (e.g.
// FINDINGS_SCHEMA -> FINDING), not every top-level const in the file - a workflow script's
// runtime data (e.g. a per-lens prompt array closing over an outer `brief` variable) can also
// happen to match `const NAME = [...]` and must never be dragged into schema evaluation.
// Postorder DFS so a dependency's `const` declaration always lands before the block that
// references it in the generated body - JS `const` is block-scoped with a temporal dead
// zone, so declaring FINDINGS_SCHEMA (which embeds FINDING) before FINDING itself throws.
function closure(rootName, blockMap) {
  const order = []
  const seen = new Set()
  function visit(name) {
    if (seen.has(name) || !blockMap.has(name)) return
    seen.add(name)
    const block = blockMap.get(name)
    for (const other of blockMap.keys()) {
      if (other !== name && new RegExp(`\\b${other}\\b`).test(block.text)) visit(other)
    }
    order.push(name)
  }
  visit(rootName)
  return order.map(n => blockMap.get(n))
}

function evalSchema(rootName, blockMap) {
  const included = closure(rootName, blockMap)
  const body = included.map(b => b.text).join('\n')
  const code = `(() => {\n${body}\nreturn ${rootName};\n})()`
  const context = vm.createContext({})
  return vm.runInContext(code, context, { timeout: 1000 })
}

const KNOWN_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

// Walk one schema node, collecting FAILs (structural bugs the SDK would reject at runtime)
// and WARNs (the SCHEMA_DESIGN.md enum-description convention, not yet a hard requirement
// across the whole library - see README.md for why this stays a WARN for now).
function walk(node, path, fails, warns) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return

  const types = Array.isArray(node.type) ? node.type : node.type ? [node.type] : []
  for (const t of types) {
    if (!KNOWN_TYPES.has(t)) fails.push(`${path}: type '${t}' is not a known JSON Schema type`)
  }

  if (types.includes('object')) {
    if (!node.properties || typeof node.properties !== 'object') {
      fails.push(`${path}: type 'object' has no properties`)
    } else if (Array.isArray(node.required)) {
      for (const key of node.required) {
        if (!(key in node.properties)) {
          fails.push(`${path}: required field '${key}' is not listed in properties`)
        }
      }
    }
    for (const [key, child] of Object.entries(node.properties || {})) {
      walk(child, `${path}.${key}`, fails, warns)
    }
  }

  if (types.includes('array') && node.items) {
    walk(node.items, `${path}[]`, fails, warns)
  }

  if (Array.isArray(node.enum)) {
    if (node.enum.length === 0) fails.push(`${path}: enum is empty`)
    if (!node.description || typeof node.description !== 'string' || !node.description.trim()) {
      warns.push(`${path}: enum ${JSON.stringify(node.enum)} has no description calibrating the values (see SCHEMA_DESIGN.md)`)
    }
  }
}

function lint(dir) {
  const name = basename(dir)
  const wfDir = join(dir, '.claude/workflows')
  const wfFiles = existsSync(wfDir) ? readdirSync(wfDir).filter(f => f.endsWith('.js')) : []
  if (wfFiles.length !== 1) return { name, fails: [], warns: [], skipped: 'no single workflow script found' }

  const src = read(join(wfDir, wfFiles[0])) || ''
  const blocks = extractConsts(src)
  if (blocks.length === 0) return { name, fails: [], warns: [], skipped: 'no const declarations found' }
  const blockMap = new Map(blocks.map(b => [b.name, b]))

  // Only lint the consts actually wired to an agent() call's schema: field - a helper object
  // like FINDING is checked as part of the schema that embeds it, not lint-only-reachable dead code.
  const usedSchemaNames = new Set([...src.matchAll(/schema:\s*([A-Z][A-Z0-9_]*)/g)].map(m => m[1]))
  const fails = []
  const warns = []
  for (const schemaName of usedSchemaNames) {
    if (!blockMap.has(schemaName)) continue // validate-workflow.mjs already catches an unresolved schema reference
    let node
    try {
      node = evalSchema(schemaName, blockMap)
    } catch (e) {
      fails.push(`${schemaName}: could not evaluate schema literal: ${String(e.message || e)}`)
      continue
    }
    walk(node, schemaName, fails, warns)
  }

  return { name, fails, warns }
}

const targets = process.argv[2] === '--all'
  ? readdirSync(REPO).filter(d => {
      try { return statSync(join(REPO, d)).isDirectory() && existsSync(join(REPO, d, '.claude/workflows')) } catch { return false }
    }).map(d => join(REPO, d))
  : [resolve(process.argv[2])]

let failedCount = 0
let warnCount = 0
for (const t of targets) {
  const { name, fails, warns, skipped } = lint(t)
  if (skipped) {
    console.log(`\x1b[33mSKIP\x1b[0m ${name} - ${skipped}`)
    continue
  }
  if (fails.length) {
    failedCount++
    console.error(`\x1b[31mFAIL\x1b[0m ${name}`)
    for (const f of fails) console.error(`  - ${f}`)
  } else if (warns.length) {
    warnCount += warns.length
    console.log(`\x1b[33mWARN\x1b[0m ${name} - ${warns.length} enum field(s) missing a calibration description`)
  } else {
    console.log(`\x1b[32mPASS\x1b[0m ${name}`)
  }
}

console.log(`\n${failedCount} package(s) with structural schema errors, ${warnCount} enum field(s) missing SCHEMA_DESIGN.md descriptions across ${targets.length} package(s) checked.`)

if (failedCount) {
  console.error('\nStructural schema errors found - these would fail at the SDK, not just look wrong. Fix before considering the work done.')
  process.exit(2)
}

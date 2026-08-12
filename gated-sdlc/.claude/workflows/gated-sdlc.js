export const meta = {
  name: 'gated-sdlc',
  description: 'Take one request from understanding to three commits on its own branch - frame, plan, build, test, review, document - refuting every agent claim against the repo before the next stage believes it',
  phases: [
    { title: 'Preflight', detail: 'the tree must be clean or the run does not start (probe, haiku)' },
    { title: 'Frame', detail: 'understand the task and derive the branch name from this repo\'s real branches (opus)' },
    { title: 'Branch', detail: 'create the branch the framer named (probe)' },
    { title: 'Plan', detail: 'turn the framed request into a plan the builder can implement without asking questions (opus)' },
    { title: 'Build', detail: 'implement the plan; the declared file list becomes the commit\'s file list (sonnet)' },
    { title: 'Test', detail: 'run the suite - a known command, so the probe runs it and no agent rediscovers it' },
    { title: 'Review', detail: 'confirm the build is what was asked for, against plan.md, judged on disk (opus)' },
    { title: 'Document', detail: 'write up the completed change from the captured diff (sonnet)' },
    { title: 'Gate', detail: 'refute every claim against the repo - batched, one probe call per phase (haiku)' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// The envelope contract
//
// Every agent returns this base. `status` is load-bearing: an envelope that
// parses but reports "fail" is not a successful phase, no matter how green
// everything around it looks.
// ─────────────────────────────────────────────────────────────────────────────

const ENVELOPE = {
  status: { type: 'string', enum: ['success', 'fail'] },
  summary: { type: 'string', description: 'One sentence: what happened' },
  artifacts: {
    type: 'array', items: { type: 'string' },
    description: 'Paths written, normally inside the handoff dir',
  },
  notesForNextAgent: { type: 'string' },
}

const envelope = (props, required = []) => ({
  type: 'object',
  properties: { ...ENVELOPE, ...props },
  required: ['status', 'summary', ...required],
})

const FRAME_SCHEMA = envelope({
  understanding: { type: 'string', description: 'The task restated: what the repo already has, and what is missing' },
  intent: { type: 'string', enum: ['feat', 'fix', 'chore', 'docs', 'refactor', 'test'] },
  slug: { type: 'string', description: 'kebab-case, derived from the understanding, not from the literal words of the request' },
  branchName: { type: 'string', description: 'The full name, already in THIS repo\'s convention' },
  conventionEvidence: {
    type: 'string',
    description: 'The REAL branch names you derived the convention from. Run git branch -a --sort=-committerdate. Do not state a generic convention you did not observe here.',
  },
  testCommand: { type: 'string', description: 'The exact command that runs the suite, verified by running it. Empty if this repo has none.' },
  blockers: { type: 'array', items: { type: 'string' }, description: 'Anything that stops this run before it starts' },
}, ['understanding', 'intent', 'slug', 'branchName', 'conventionEvidence'])

const PLAN_SCHEMA = envelope({
  commitMessage: { type: 'string', description: 'Imperative one-line subject for the commit of THE PLAN FILE, not of code that does not exist yet' },
})

const BUILD_SCHEMA = envelope({
  changedFiles: { type: 'array', items: { type: 'string' } },
  fileCount: { type: 'number', description: 'Redundant on purpose: a gate cross-checks it against changedFiles' },
  commitMessage: { type: 'string', description: 'Imperative one-line subject for the commit of THE CODE' },
}, ['changedFiles', 'fileCount'])

const REVIEW_SCHEMA = envelope({
  approved: { type: 'boolean', description: 'true ONLY when every requirement is met and blocking is empty' },
  findings: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        requirement: { type: 'string' },
        met: { type: 'boolean' },
        evidence: { type: 'string', description: 'A file:line, or exactly what is missing' },
      },
      required: ['requirement', 'met'],
    },
  },
  blocking: { type: 'array', items: { type: 'string' } },
}, ['approved'])

const DOCUMENT_SCHEMA = envelope({
  documentPath: { type: 'string', description: 'The write-up\'s home in the repo' },
  commitMessage: { type: 'string', description: 'Imperative one-line subject for the commit of THE WRITE-UP' },
}, ['documentPath'])

// The probe is the substitute for a kind="code" phase, so it does NOT return an
// envelope: it returns observations. There is no summary to write and no status
// to declare - a failing command is a finding, not a failed phase.
const PROBE_SCHEMA = {
  type: 'object',
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ok: { type: 'boolean', description: 'From the exit code or the stat. Never from an impression.' },
          observed: { type: 'string', description: 'What the command actually printed, verbatim. Never a judgement.' },
        },
        required: ['id', 'ok', 'observed'],
      },
    },
  },
  required: ['checks'],
}

// ─────────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────────

// Normalize args: this environment can deliver the Workflow `args` as a JSON-encoded
// string. Parse it back to an object when that happens; keep a genuine plain-string arg as-is.
let input = args
if (typeof input === 'string') {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object') input = parsed
  } catch {
    // not JSON - a genuine plain-string argument, keep as-is
  }
}

const request = typeof input === 'string' ? input : input && input.request
if (!request) {
  throw new Error(
    'Missing the request. Call this workflow with args set to either a plain string ' +
    '(the request itself) or an object shaped { "request": "...", "runId": "..." }.'
  )
}
const runId = (input && typeof input === 'object' && input.runId) || 'run'
const HANDOFF = `.claude/runs/${runId}/handoff`

const MAX_FIX_LOOPS = 3
const MAX_REVISION_LOOPS = 2

// ─────────────────────────────────────────────────────────────────────────────
// The probe: our kind="code" phase
//
// One agent, one closed vocabulary. The invocation for every named check type
// lives in `gated-probe.md`, not here: this script names a check and its
// parameters, and the probe runs the one fixed command that type maps to. It
// cannot compose its own, and neither can we compose a wrong one.
//
// Only `run`, `capture` and `exits_zero` take a literal command, and even there
// the probe runs exactly what it was handed. The hole the closed vocabulary
// guards against is the probe INVENTING a command, not code authoring one.
// ─────────────────────────────────────────────────────────────────────────────

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`

// The working-tree changeset, captured verbatim for the boundary check. This is
// a `capture`, not the probe's `fingerprint` check - that one hashes a single
// file against an expected hash, which is a different question.
const TREE_CMD =
  'git diff HEAD --numstat; echo "---UNTRACKED---"; git ls-files --others --exclude-standard'

// The probe takes one `path` per check, so a claim about N files becomes N
// checks. That is the point: the report names the file that failed, not "one of
// the five you listed".
const eachPath = (type, label, paths, extra = {}) =>
  (paths || []).filter(Boolean).map(p => ({ type, id: `${label}: ${p}`, path: p, ...extra }))

async function probe(checks, label) {
  const report = await agent(
    'Run exactly these checks against the repo and report what you observed.\n' +
    'Do not fix anything. Do not interpret. Do not run anything you were not given.\n' +
    '`ok` comes from the exit code or the stat, never from an impression.\n' +
    '`observed` is what the command actually printed, verbatim.\n\n' +
    JSON.stringify(checks, null, 2),
    {
      label: `probe:${label}`, phase: 'Gate', agentType: 'gated-probe',
      model: 'haiku', effort: 'low', schema: PROBE_SCHEMA,
    },
  )

  // FAIL CLOSED. A probe that died reported nothing, and nothing is not a pass.
  // Same rule as NULL_SAFETY_AFTER_FANOUT.md, applied to the green light.
  const rows = report ? report.checks : []
  const byId = (id) => rows.find(r => r.id === id)
  return {
    rows,
    died: !report,
    ok: (id) => Boolean(byId(id) && byId(id).ok),
    observed: (id) => (byId(id) ? byId(id).observed : ''),
    failures: report
      ? rows.filter(r => !r.ok).map(r => `${r.id}: ${r.observed}`)
      : [`the probe did not report on ${checks.length} check(s)`],
  }
}

function parseFingerprint(observed) {
  const map = {}
  const [numstat = '', untracked = ''] = String(observed).split('---UNTRACKED---')
  for (const line of numstat.split('\n')) {
    const f = line.split('\t')
    if (f.length >= 3 && f[2].trim()) map[f[2].trim()] = `${f[0]},${f[1]}`
  }
  for (const p of untracked.split('\n')) {
    if (p.trim()) map[p.trim()] = 'untracked'
  }
  return map
}

// Every path whose state differs: appeared, vanished, or was rewritten.
// Comparing CHANGESETS rather than watching writes is what catches a reversion -
// a path that was dirty before and is clean now was reverted, and reverting is
// modifying. No write interceptor sees that.
function changedPaths(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(p => before[p] !== after[p])
    .sort()
}

// ─────────────────────────────────────────────────────────────────────────────
// The write boundary
//
// `tools:` is a capability list, not a boundary. Bash runs `git checkout` and
// Write reaches any path, so no tool list can make "this agent changes nothing"
// true. It is verified against git, after the fact.
// ─────────────────────────────────────────────────────────────────────────────

const WRITES = {
  'gated-framer': [],                              // [] = read-only with respect to the repo
  'gated-planner': ['specs/', `${HANDOFF}/`],
  'gated-reviewer': [],                            // a reviewer that cannot fix does not quietly fix
  'gated-documenter': ['docs/', '**/*.md'],
  'gated-builder': null,                           // null = unrestricted, and the only one
}
const PROTECTED = ['.claude/workflows/', '.claude/agents/', '.claude/commands/', 'CLAUDE.md']

// `*` stops at a path separator; `**` is how you say "cross directories".
// fnmatch semantics would let `*` cross `/`, quietly widening every pattern.
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

function permitted(path, agentType) {
  const allow = WRITES[agentType]
  if (path.startsWith(`${HANDOFF}/`) || path.startsWith('.claude/runs/')) return true
  if ((allow || []).some(p => matches(path, p))) return true   // naming a path is what unlocks it
  if (PROTECTED.some(p => matches(path, p))) return false      // nobody edits their own evaluator
  return allow === null
}

// ─────────────────────────────────────────────────────────────────────────────
// Gates
//
// A schema-validated result is a MANIFEST OF CLAIMS, not evidence. These refute
// the claims. Two tiers, because a Workflow script has no filesystem access:
//   pure  - the claim against itself. Runs here. Zero tokens.
//   world - the claim against the repo. Batched into ONE probe call per phase.
// ─────────────────────────────────────────────────────────────────────────────

const PURE = {
  verdict_consistent: (c) => {
    const unmet = (c.findings || []).filter(f => !f.met).map(f => f.requirement)
    const blocking = c.blocking || []
    const out = []
    if (c.approved && (blocking.length || unmet.length)) {
      out.push(`approved=true while naming ${blocking.length} blocking item(s) and ${unmet.length} unmet requirement(s)`)
    }
    if (!c.approved && !blocking.length && !unmet.length) {
      out.push('approved=false but no blocking item or unmet requirement was given')
    }
    return out
  },
  counts_match: (c, { field, count }) => {
    const n = (c[field] || []).length
    return n === c[count] ? [] : [`${count}=${c[count]} but ${field} holds ${n} entries`]
  },
  slug_shape: (c) =>
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug || '')
      ? []
      : [`slug ${JSON.stringify(c.slug)} is not kebab-case: git will not take it as-is`],
  branch_matches_intent: (c) => {
    const b = c.branchName || ''
    const out = []
    if (!c.slug || !b.includes(c.slug)) out.push(`branchName ${JSON.stringify(b)} does not contain its own slug ${JSON.stringify(c.slug)}`)
    if (!c.intent || !b.includes(c.intent)) out.push(`branchName ${JSON.stringify(b)} does not reflect intent=${c.intent}`)
    return out
  },
  no_placeholder: (c, { fields }) =>
    fields
      .filter(f => !String(c[f] || '').trim() || /\b(TODO|TBD|FIXME|lorem ipsum)\b|<\.\.\.>/i.test(String(c[f])))
      .map(f => `${f} is empty or still holds placeholder text`),
}

const gateLog = []

async function gate(claim, checks, phaseName) {
  const violations = []
  const world = []

  for (const c of checks) {
    if (PURE[c.type]) violations.push(...PURE[c.type](claim, c))
    else world.push(c)
  }

  if (world.length) {
    const report = await probe(world, `gate:${phaseName}`)
    violations.push(...report.failures)
    gateLog.push({ phase: phaseName, checks: report.rows })
  }

  if (violations.length) gateLog.push({ phase: phaseName, violations })
  return violations
}

// The correction is a COLD retry: there is no session continuation inside a
// Workflow script, so the retry prompt carries the task, the previous claim, and
// the harness's verbatim observation - not "files missing" but
// "src/auth.ts: no such file". Exactly one retry: if the second attempt does not
// verify either, the problem is not phrasing.
const correctionPrompt = (base, claim, violations) => `${base}

## Your previous report failed validation

You reported:
${JSON.stringify(claim, null, 2)}

The harness checked that against the repo and observed:
- ${violations.join('\n- ')}

Fix the work, or fix the report if the report is what is wrong.
Emit the complete JSON again.`

async function gated(name, produce, checksFor) {
  const claim = await produce()
  if (!claim) throw new Error(`${name}: the agent died - there is no claim to verify`)
  if (claim.status === 'fail') throw new Error(`${name}: the agent reported status=fail - ${claim.summary}`)

  const violations = await gate(claim, checksFor(claim), name)
  if (!violations.length) return claim

  log(`${name}: ${violations.length} claim(s) refuted, retrying cold`)
  const retry = await produce(claim, violations)
  if (!retry) throw new Error(`${name}: the retry died. Still unverified: ${violations[0]}`)

  const still = await gate(retry, checksFor(retry), `${name}-retry`)
  if (still.length) throw new Error(`${name}: never produced a verifiable claim - ${still.join(' · ')}`)
  return retry
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompts
//
// Identity lives in the agent's .md (its system prompt). The SHAPE of the task
// lives here, at the call site. Same agent, many calls, different shape.
// ─────────────────────────────────────────────────────────────────────────────

const task = (previous, extra = '') => [
  `## The request\n\n${request}`,
  `## Previous envelope\n\n${previous ? JSON.stringify(previous, null, 2) : '(none)'}`,
  `## Handoff directory\n\n${HANDOFF}\nWrite anything the agents after you need to read into that directory.`,
  extra,
].filter(Boolean).join('\n\n')

// One agent per phase, correction built in. `produce` receives the previous
// claim and the violations only on the retry.
const phaseAgent = (agentType, model, schema, previous, extra) => (prev, violations) =>
  agent(
    prev ? correctionPrompt(task(previous, extra), prev, violations) : task(previous, extra),
    { agentType, model, schema },
  )

// ─────────────────────────────────────────────────────────────────────────────
// The run
// ─────────────────────────────────────────────────────────────────────────────

const phaseLog = []
const commitsMade = []
let treeState = {}
let frame = null, plan = null, build = null, review = null, writeup = null
let test = null
let branchCreated = false

// Take one fingerprint, compare it to the last one, and enforce the boundary.
// One probe call per phase, not two: the "after" of phase N is the "before" of
// phase N+1, since nothing runs in between.
async function settle(agentType, label) {
  const report = await probe([{ type: 'capture', id: 'tree', command: TREE_CMD }], `tree:${label}`)
  if (report.died) throw new Error(`${label}: could not read the working tree, so no claim about it can be trusted`)
  const after = parseFingerprint(report.observed('tree'))
  const touched = changedPaths(treeState, after)
  const breaches = agentType ? touched.filter(p => !permitted(p, agentType)) : []
  treeState = after

  if (breaches.length) {
    // The tree started clean, so every breach was introduced by this run and
    // rolling it back cannot destroy uncommitted work of yours. That guarantee
    // is exactly what the dirty-tree abort buys.
    await probe(
      breaches.map((p, i) => ({ type: 'run', id: `rollback ${i}`, command: `git checkout -- ${shq(p)} 2>/dev/null || rm -f ${shq(p)}` })),
      `rollback:${label}`,
    )
    // A breach is NOT a gate violation: the write already happened and no
    // re-prompt undoes it. The phase dies and every path is named.
    throw new Error(`${agentType} wrote outside its boundary: ${breaches.join(', ')} (rolled back)`)
  }
  return touched
}

// Stage EXACTLY the paths a gate already verified. Never `git add -A`: that
// sweeps whatever else is lying around into a commit its author never wrote.
async function commit(paths, message, label) {
  const clean = (paths || []).filter(Boolean)
  if (!clean.length) throw new Error(`${label}: no verified path to commit`)
  const report = await probe([
    { type: 'run', id: 'add', command: `git add -- ${clean.map(shq).join(' ')}` },
    { type: 'run', id: 'commit', command: `git commit -m ${shq(message)}` },
    { type: 'capture', id: 'sha', command: 'git rev-parse --short HEAD' },
    { type: 'capture', id: 'tree', command: TREE_CMD },
  ], label)
  if (report.failures.length) throw new Error(`${label} failed: ${report.failures.join(' · ')}`)
  treeState = parseFingerprint(report.observed('tree'))
  commitsMade.push({ label, sha: report.observed('sha').trim(), message, files: clean })
  log(`${label}: ${report.observed('sha').trim()} - ${message}`)
}

const record = (name, owner, status, error = '') => phaseLog.push({ name, owner, status, error })

// ── Preflight ────────────────────────────────────────────────────────────────
phase('Preflight')
const pre = await probe([
  { type: 'exits_zero', id: 'git repo', command: 'git rev-parse --git-dir' },
  // Created here, not where it is first written to. The planner is told to put
  // plan.md in it and the plan commit stages that path, so the directory
  // existing is on the critical path - too load-bearing to leave to whatever
  // the Write tool happens to do about missing parents.
  { type: 'run', id: 'handoff dir', command: `mkdir -p ${shq(HANDOFF)}` },
  { type: 'capture', id: 'branch', command: 'git rev-parse --abbrev-ref HEAD' },
  { type: 'capture', id: 'baseline', command: 'git rev-parse HEAD' },
  { type: 'capture', id: 'tree', command: TREE_CMD },
], 'preflight')

if (pre.died || !pre.ok('git repo')) {
  return { accepted: false, reason: 'this is not a git repository, so there is nothing to branch from or commit to', phases: phaseLog }
}

treeState = parseFingerprint(pre.observed('tree'))
const dirtyPaths = Object.keys(treeState)
const startedOn = pre.observed('branch').trim()
const baseline = pre.observed('baseline').trim()

// A clean tree or no run. This is not tidiness: it is what makes everything else
// safe. With `before` empty, any path that shows up later was introduced by this
// run, so a rollback can never destroy your work and no commit can sweep it up.
if (dirtyPaths.length) {
  const onOwnBranch = /^(feat|fix|chore|docs|refactor|test)[\/-]/.test(startedOn)
  return {
    accepted: false,
    reason:
      `the working tree has ${dirtyPaths.length} uncommitted path(s). This workflow creates a branch and ` +
      `commits three times, so starting dirty is how your work ends up in a commit you did not write.` +
      (onOwnBranch
        ? ` You are on ${startedOn}, which looks like a branch a previous gated-sdlc run left behind: either commit what is there and run again, or discard it and start over.`
        : ' Commit or stash first.'),
    dirtyPaths,
    branch: startedOn,
    phases: phaseLog,
  }
}

record('preflight', 'probe', 'success')
log(`clean tree on ${startedOn} @ ${baseline.slice(0, 7)}`)

try {
  // ── Frame ──────────────────────────────────────────────────────────────────
  phase('Frame')
  frame = await gated('frame',
    phaseAgent('gated-framer', 'opus', FRAME_SCHEMA, null,
      '## Naming the branch\n\n' +
      'Run `git branch -a --sort=-committerdate | head -20` and derive the convention from the REAL ' +
      'branch names in this repo. Quote those names in `conventionEvidence`. Do not apply a generic ' +
      'convention you saw elsewhere: every repo names differently, and guessing produces a branch that ' +
      'looks like nothing else in the project.\n\n' +
      'Also find the test command and verify it by actually running it. Every later phase depends on it.'),
    () => [
      { type: 'slug_shape' },
      { type: 'branch_matches_intent' },
      { type: 'no_placeholder', fields: ['understanding', 'conventionEvidence'] },
    ])
  await settle('gated-framer', 'frame')
  record('frame', 'gated-framer', 'success')

  if (frame.blockers && frame.blockers.length) {
    return {
      accepted: false,
      reason: `cannot start: ${frame.blockers.join(' · ')}`,
      understanding: frame.understanding,
      phases: phaseLog,
    }
  }

  // ── Branch ─────────────────────────────────────────────────────────────────
  phase('Branch')
  // `branch_free` is the one check whose underlying command is SUPPOSED to fail:
  // a zero exit from `git rev-parse --verify` means the branch already exists.
  // The probe owns that inversion and reports `ok` already flipped, so this
  // reads like every other check.
  const lookup = await probe(
    [{ type: 'branch_free', id: 'the branch is free', branchName: frame.branchName }],
    'branch-free',
  )
  if (!lookup.ok('the branch is free')) {
    return {
      accepted: false,
      reason: `the branch ${frame.branchName} already exists - running here would land this work on top of someone else's`,
      branch: frame.branchName,
      phases: phaseLog,
    }
  }
  const made = await probe([{ type: 'run', id: 'checkout', command: `git checkout -b ${shq(frame.branchName)}` }], 'branch')
  if (made.failures.length) throw new Error(`could not create ${frame.branchName}: ${made.failures.join(' · ')}`)
  branchCreated = true
  record('branch', 'probe', 'success')
  log(`on ${frame.branchName}`)

  // ── Plan ───────────────────────────────────────────────────────────────────
  phase('Plan')
  plan = await gated('plan',
    phaseAgent('gated-planner', 'opus', PLAN_SCHEMA, frame,
      `Write the plan to \`specs/${frame.slug}-plan.md\` and list that exact path in \`artifacts\`. ` +
      'That file is the plan; the envelope only announces it. It gets committed, which is why it goes ' +
      `in \`specs/\` and not in the handoff dir - the handoff dir is this run's scratch space and its ` +
      'contents are not meant to outlive the run.\n\n' +
      'The reviewer will use this file as its spec, so a requirement the plan does not name is a ' +
      'requirement nobody will verify.'),
    (c) => [
      { type: 'no_placeholder', fields: ['summary'] },
      ...eachPath('exists', 'the plan is on disk', c.artifacts),
      ...eachPath('min_bytes', 'the plan is not a stub', c.artifacts, { bytes: 500 }),
    ])
  await settle('gated-planner', 'plan')
  record('plan', 'gated-planner', 'success')

  // Commit 1 of 3: the spec goes on record before any code exists to blur it.
  // The words are the planner's, about the planner's work product.
  await commit(plan.artifacts, plan.commitMessage || `docs: ${plan.summary}`, 'commit_plan')
  record('commit_plan', 'probe', 'success')

  // ── Build ──────────────────────────────────────────────────────────────────
  phase('Build')
  const buildChecks = (c) => [
    { type: 'counts_match', field: 'changedFiles', count: 'fileCount' },
    ...eachPath('exists', 'declared file exists', c.changedFiles),
    ...eachPath('in_diff', 'declared file is in the diff', c.changedFiles),
  ]
  build = await gated('build',
    phaseAgent('gated-builder', 'sonnet', BUILD_SCHEMA, plan,
      `Your spec is \`${plan.artifacts[0]}\`. Read it in full before writing anything.\n\n` +
      'Report every file you changed in `changedFiles`. That verified list becomes the commit\'s file ' +
      'list: a file you touched but did not declare will not be committed.'),
    buildChecks)
  await settle('gated-builder', 'build')
  record('build', 'gated-builder', 'success')

  // ── Test, and the bounded fix loop ─────────────────────────────────────────
  // Running the suite is a known command, so the probe runs it. No agent has to
  // rediscover the test runner, and no context window is spent learning what a
  // subprocess already knows.
  if (frame.testCommand) {
    for (let i = 1; i <= MAX_FIX_LOOPS; i++) {
      phase('Test')
      const run = await probe([{ type: 'exits_zero', id: 'suite', command: frame.testCommand }], `test_${i}`)
      test = { passed: run.ok('suite'), exitCode: run.ok('suite') ? 0 : 1, output: run.observed('suite') }
      record(`test_${i}`, 'probe', 'success')
      if (test.passed) { log(`suite green on attempt ${i}`); break }
      if (i === MAX_FIX_LOOPS) { log(`suite still red after ${MAX_FIX_LOOPS} attempts`); break }

      log(`suite red, fix ${i} of ${MAX_FIX_LOOPS - 1}`)
      phase('Build')
      build = await gated(`fix_${i}`,
        phaseAgent('gated-builder', 'sonnet', BUILD_SCHEMA, build,
          `The suite failed. This is its verbatim output - address every failure it reports, not just the first:\n\n` +
          `\`\`\`\n${test.output}\n\`\`\``),
        buildChecks)
      await settle('gated-builder', `fix_${i}`)
      record(`fix_${i}`, 'gated-builder', 'success')
    }
  } else {
    // No suite means nothing in this run can prove the code runs. Marking that
    // as passed would be the exact failure this package exists to prevent: an
    // unverified claim treated as a verified one, and `accepted: true` on a
    // build nobody executed. Unverified is failed, including here.
    test = { passed: false, exitCode: null, noSuite: true, output: 'this repo has no test command' }
    log('no test command - the code cannot be verified, so it will not be committed')
  }

  // ── Review, and the bounded revision loop ──────────────────────────────────
  // A different question from the suite's. The suite asks "does it run"; the
  // review asks "is this what was asked for". Neither answers the other.
  let revised = false
  for (let i = 1; i <= MAX_REVISION_LOOPS; i++) {
    phase('Review')
    review = await gated(`review_${i}`,
      phaseAgent('gated-reviewer', 'opus', REVIEW_SCHEMA, build,
        `Your spec is \`${plan.artifacts[0]}\`. Judge the code on disk, never the builder's summary of it: ` +
        `start from its changedFiles, read them, and use \`git diff\` for anything the envelope did not mention.`),
      () => [{ type: 'verdict_consistent' }])
    await settle('gated-reviewer', `review_${i}`)
    record(`review_${i}`, 'gated-reviewer', 'success')

    if (review.approved || i === MAX_REVISION_LOOPS) break

    log(`review ${i} blocked on ${review.blocking.length} item(s), revising`)
    phase('Build')
    build = await gated(`revise_${i}`,
      phaseAgent('gated-builder', 'sonnet', BUILD_SCHEMA, review,
        `The reviewer blocked this build. Close every one of these, and nothing else:\n\n- ${review.blocking.join('\n- ')}`),
      buildChecks)
    await settle('gated-builder', `revise_${i}`)
    record(`revise_${i}`, 'gated-builder', 'success')
    revised = true
  }

  // A revision edited code after the suite last ran, so the green light is
  // stale. Re-run rather than commit on a result that predates the change.
  if (revised && review.approved && frame.testCommand) {
    phase('Test')
    const run = await probe([{ type: 'exits_zero', id: 'suite', command: frame.testCommand }], 'retest')
    test = { passed: run.ok('suite'), exitCode: run.ok('suite') ? 0 : 1, output: run.observed('suite') }
    record('retest', 'probe', 'success')
  }

  const verified = Boolean(test && test.passed && review && review.approved)

  // Red tests or a rejected review stop the chain here. The code stays
  // uncommitted and nothing is documented, because there is nothing worth
  // describing yet. The plan commit stands: it is a record of what was asked.
  if (verified) {
    // Commit 2 of 3: the code lands only now - green suite, approved review.
    await commit(build.changedFiles, build.commitMessage || `${frame.intent}: ${build.summary}`, 'commit_build')
    record('commit_build', 'probe', 'success')

    // ── Changes ──────────────────────────────────────────────────────────────
    // Measured against the commit this run started from, not against the default
    // branch: by now the run has moved things itself.
    phase('Document')
    const diffPath = `${HANDOFF}/run.diff`
    const captured = await probe([
      { type: 'run', id: 'capture the diff', command: `mkdir -p ${shq(HANDOFF)} && git diff ${shq(baseline)} HEAD > ${shq(diffPath)}` },
      { type: 'non_empty', id: 'the diff is not empty', path: diffPath },
      { type: 'capture', id: 'stat', command: `git diff --shortstat ${shq(baseline)} HEAD` },
    ], 'changes')
    if (captured.failures.length) {
      throw new Error(`nothing changed since ${baseline.slice(0, 7)} - there is nothing to document: ${captured.failures.join(' · ')}`)
    }
    record('changes', 'probe', 'success')
    log(`diff captured: ${captured.observed('stat').trim()}`)

    // ── Document ─────────────────────────────────────────────────────────────
    writeup = await gated('document',
      phaseAgent('gated-documenter', 'sonnet', DOCUMENT_SCHEMA, build,
        `Read ${diffPath} in full before writing. Document only what that diff shows - ` +
        'not the plan\'s promises, and not behaviour you believe exists elsewhere in the system.'),
      (c) => [
        { type: 'exists', id: 'the write-up is on disk', path: c.documentPath },
        { type: 'min_bytes', id: 'the write-up is not a stub', path: c.documentPath, bytes: 400 },
      ])
    await settle('gated-documenter', 'document')
    record('document', 'gated-documenter', 'success')

    // Commit 3 of 3: the write-up ships beside the code it describes.
    await commit([writeup.documentPath], writeup.commitMessage || `docs: ${writeup.summary}`, 'commit_docs')
    record('commit_docs', 'probe', 'success')
  }

  // ── Acceptance ─────────────────────────────────────────────────────────────
  // Two questions, not one. A phase that ran the suite and saw it red did its
  // job: the PHASE succeeds while the RUN must not.
  return verdict(verified)
} catch (error) {
  record('failed', 'workflow', 'fail', String(error.message || error))
  return verdict(false, String(error.message || error))
}

function verdict(accepted, thrown = '') {
  const reasons = [
    thrown,
    !thrown && test && test.noSuite &&
      'this repo has no test command, so nothing in the run proved the code runs. ' +
      'The plan is committed and the code is in the working tree, unverified and uncommitted, ' +
      'for you to check by hand',
    !thrown && test && !test.passed && !test.noSuite && `the suite never came back green (exit ${test.exitCode})`,
    !thrown && review && !review.approved && `the review never approved: ${(review.blocking || []).join(' · ')}`,
    !thrown && !review && 'the run never reached a review',
  ].filter(Boolean)

  return {
    accepted,
    reason: accepted ? '' : reasons.join(' · '),

    // The run does NOT return you to where you started: it leaves you standing
    // on its own branch, with whatever is there. A failed run is as navigable as
    // a successful one - the plan committed, the code uncommitted, and you
    // already in the right place to carry on by hand.
    branch: frame && frame.branchName,
    branchedFrom: startedOn,
    leftYouOn: branchCreated ? frame.branchName : startedOn,
    uncommitted: !accepted && build ? build.changedFiles : [],
    commits: commitsMade,

    // The evidence travels with the verdict, so the report cannot claim anything
    // the harness did not observe.
    evidence: {
      understanding: frame && frame.understanding,
      conventionEvidence: frame && frame.conventionEvidence,
      testCommand: frame && frame.testCommand,
      exitCode: test && test.exitCode,
      planPath: plan && plan.artifacts && plan.artifacts[0],
      documentPath: writeup && writeup.documentPath,
      blocking: review && review.blocking,
    },
    gates: gateLog,
    phases: phaseLog,
  }
}

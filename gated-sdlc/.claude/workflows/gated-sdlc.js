export const meta = {
  name: 'gated-sdlc',
  description: 'Take one request from understanding to three commits on its own branch - frame, plan, build, test, review, document - refuting every agent claim against the repo before the next stage believes it',
  phases: [
    { title: 'Preflight', detail: 'the tree must be clean or the run does not start (probe, sonnet - it fingerprints the tree)' },
    { title: 'Frame', detail: 'understand the task and derive the branch name from this repo\'s real branches (opus)' },
    { title: 'Branch', detail: 'create the branch the framer named (probe)' },
    { title: 'Plan', detail: 'turn the framed request into a plan the builder can implement without asking questions (opus)' },
    { title: 'Build', detail: 'implement the plan; the declared file list becomes the commit\'s file list (sonnet)' },
    { title: 'Test', detail: 'run the suite - a known command, so the probe runs it and no agent rediscovers it' },
    { title: 'Review', detail: 'confirm the build is what was asked for, against plan.md, judged on disk (opus)' },
    { title: 'Document', detail: 'write up the completed change from the captured diff (sonnet)' },
    { title: 'Gate', detail: 'refute every claim against the repo - batched, one probe call per phase (probe; haiku, or sonnet where the script parses what it read back)' },
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
  blockers: { type: 'array', items: { type: 'string' }, description: 'Anything that stops this run before it starts' },
}, ['understanding', 'intent', 'slug', 'branchName', 'conventionEvidence'])

const PLAN_SCHEMA = envelope({
  // Named explicitly rather than read off artifacts[0]. Three later phases use
  // this path as their spec, and `artifacts` is an unordered, unrequired list:
  // a planner that writes a second file first silently hands the builder and
  // the reviewer the wrong document, and one that writes none at all passes
  // every gate and dies later at the commit with "no verified path".
  planPath: { type: 'string', description: 'The exact path the plan was written to, under specs/. This is the spec the builder and reviewer read.' },
  commitMessage: { type: 'string', description: 'Imperative one-line subject for the commit of THE PLAN FILE, not of code that does not exist yet' },
}, ['planPath'])

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
    '(the request itself) or an object shaped ' +
    '{ "request": "...", "runId": "...", "testCommand": "..." }.'
  )
}
const runId = (input && typeof input === 'object' && input.runId) || 'run'
if (!/^[a-z0-9][a-z0-9-]*$/.test(runId)) {
  throw new Error(
    `runId ${JSON.stringify(runId)} must be lowercase alphanumeric with dashes: it becomes a ` +
    `directory path that this run passes to the shell many times.`)
}
const HANDOFF = `.claude/runs/${runId}/handoff`

// The test command is OPERATOR INPUT, never an agent's discovery.
//
// An agent that finds `npm test` has confirmed a command exists, not that it
// tests anything. A repo whose test script is `echo "no tests" && exit 0`
// returns exit 0 forever, and every downstream phase reads that as a green
// suite: the run commits and reports accepted:true having verified nothing.
// The system this ports refuses to guess for exactly this reason - its test
// block ships as a placeholder that announces it is fake, because "a
// wrong-but-plausible command that silently passes is worse than one that says
// so out loud".
//
// It is also the only agent-authored string that would reach the shell
// unquoted, since a test command is a command line by nature. Taking it from
// the operator closes both holes with one decision.
const testCommand = (input && typeof input === 'object' && input.testCommand) || ''

// These are review/revise ROUND counts, not repair counts: the loop is
// review -> revise -> review, so N rounds buy N-1 revisions. The revision loop
// used to be 2, which bought exactly one, and that is what killed the my-rag
// Phase 3 run: review 1 blocked on a crash, the single revision closed it, and
// review 2 found a second, unrelated, one-line gap with no budget left to fix
// it. Fixing one blocker is what lets the reviewer see past it to the next, so
// finding something new on the second pass is the normal case, not a stall.
//
// The asymmetry between these two was also backwards. The suite is a mechanical
// signal a builder can chase down on its own and it had three rounds; the
// review is the judgment call that actually blocked two runs out of four, and it
// had the fewest. They are level now.
//
// Neither is uncapped, and that matters more than the exact number: an agent
// that cannot satisfy a reviewer in two tries is not going to be talked into it
// on the fifth, and the run ending with the code uncommitted and the finding
// named is a better outcome than a loop burning tokens against a wall.
const MAX_FIX_LOOPS = 3
const MAX_REVISION_LOOPS = 3

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

// SHELL QUOTING THAT NEVER ESCAPES, BECAUSE THE PROBE CANNOT COPY AN ESCAPE.
//
// Proven on the first real run (my-rag, 2026-08-13). The script emitted the
// textbook POSIX form for a message containing an apostrophe:
//
//   git commit -m 'Fix ... in its own section'\''s text'
//
// and the probe executed:
//
//   git commit -m 'Fix ... in its own section'\\''s text'
//                                             ^^ one backslash became two
//
// which parses as: closed string, a literal backslash, an empty string, `s`,
// then an unquoted space and `text'` opening a quote that never closes. zsh
// said `unmatched '` and the run lost its code commit at the last step.
//
// `shq()` was correct - that command line runs fine in a real shell. The
// corruption happened in transcription, and no amount of correctness upstream
// survives a model retyping a backslash. So the invariant is not "escape
// properly", it is **never emit a string that needs escaping**: shq() throws
// instead, and callers keep free-form text off the command line entirely.
const SHELL_UNSAFE = /['"\\\n\r\t`$]|[\x00-\x1f]/

function shq(s) {
  const str = String(s)
  if (SHELL_UNSAFE.test(str)) {
    throw new Error(
      `refusing to shell-quote ${JSON.stringify(str)}: it contains a character that would ` +
      `need escaping, and an escaped command line does not survive the probe verbatim. ` +
      `Free-form text belongs in a file, not on the command line.`)
  }
  return `'${str}'`
}

// The same question as a predicate, for gates that must refuse a value rather
// than throw on it.
const shellSafe = (s) => !SHELL_UNSAFE.test(String(s == null ? '' : s))

// Send a whole command's output to a file, INCLUDING when the command is
// compound.
//
// `a && b > log` redirects only `b`: shell redirection binds to the simple
// command it sits on, not to the list. A real repo's test command is routinely
// compound - `make backend-test && npm test` - and the naive form silently
// captures the second half only, so a builder in fix mode reads a log that is
// missing exactly the failures it was sent to repair. The subshell makes the
// whole list one unit; its exit status is still the list's, so an early
// failure short-circuits and is reported unchanged.
//
// The command itself is operator input and is deliberately NOT quoted - a test
// command is a command line by nature. That is why it comes from `args` and
// never from an agent.
const redirected = (command, logPath) => `( ${command} ) > ${shq(logPath)} 2>&1`

// `observed` is NOT raw command output, and treating it as such is a real bug.
//
// gated-probe.md specifies that every invocation ends in `; echo "EXIT:$?"` so
// the exit code lands in text the model already has. That trailing line is part
// of `observed`. Read as data it corrupts everything downstream: a `capture` of
// `git rev-parse HEAD` yields "abc123\nEXIT:0", which is not a rev any later
// command accepts, and the untracked section of the tree capture gains a
// phantom path named "EXIT:0" - enough on its own to make a clean tree read as
// dirty and abort every run at preflight.
//
// Stripped once, here, so no caller has to remember. It is deliberately
// tolerant: the probe is a model, so this must hold whether or not it followed
// its own spec on any given call.
const stripExit = (s) => String(s == null ? '' : s).replace(/\s*\n?EXIT:-?\d+[^\n]*\s*$/, '')

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

// Most checks are read for `ok` alone, which comes from an exit code: the probe
// either ran the command or it did not, and no amount of model is going to
// change a 0 into a 1. Haiku is right for those.
//
// A few calls are different. The script has no filesystem, so anything it needs
// to READ about the repo arrives as an `observed` string the probe retyped, and
// three of those strings get parsed into decisions rather than compared to zero:
// the working-tree fingerprint that drives the write-boundary rollback, and the
// sha and subject a commit reports back. Verbatim transcription of awkward
// output is exactly where a small model slips - run 1 died when the probe
// doubled a backslash retyping a commit message - so those calls pay for a
// bigger one. Effort stays `low` everywhere on purpose: changing the tier and
// the effort together would make neither measurable.
const FINGERPRINT_MODEL = 'sonnet'

// `opts.phase` matters for the progress display, not the logic. `agent()` lets
// an explicit phase override the ambient `phase()` state, so hardcoding one here
// silently emptied every phase whose only agent is a probe - Preflight, Branch
// and Test rendered as boxes that never ran. They ran; they were being filed
// under Gate. Each caller now names its own.
async function probe(checks, label, opts = {}) {
  const report = await agent(
    'Run exactly these checks against the repo and report what you observed.\n' +
    'Do not fix anything. Do not interpret. Do not run anything you were not given.\n' +
    '`ok` comes from the exit code or the stat, never from an impression.\n' +
    '`observed` is what the command actually printed, verbatim.\n\n' +
    JSON.stringify(checks, null, 2),
    {
      label: `probe:${label}`,
      phase: opts.phase || 'Gate',
      agentType: 'gated-probe',
      model: opts.model || 'haiku',
      effort: 'low',
      schema: PROBE_SCHEMA,
    },
  )

  // FAIL CLOSED. A probe that died reported nothing, and nothing is not a pass.
  // Same rule as NULL_SAFETY_AFTER_FANOUT.md, applied to the green light.
  const rows = report && Array.isArray(report.checks) ? report.checks : []
  const byId = (id) => rows.find(r => r.id === id)
  return {
    rows,
    died: !report,
    ok: (id) => Boolean(byId(id) && byId(id).ok),
    // Stripped: every caller reading this wants command output, not the
    // probe's exit-code footer. Failures keep the footer - there the exit code
    // is the most useful thing in the line.
    observed: (id) => (byId(id) ? stripExit(byId(id).observed) : ''),
    failures: report
      ? rows.filter(r => !r.ok).map(r => `${r.id}: ${r.observed}`)
      : [`the probe did not report on ${checks.length} check(s)`],
  }
}

// Belt and braces with stripExit: that removes the footer at the source, this
// refuses to accept an EXIT line as a filename even if one survives in the
// middle of the output. Parsing model-produced text is the one place in this
// package where paranoia is free.
const isExitLine = (s) => /^EXIT:-?\d+/.test(s.trim())

function parseFingerprint(observed) {
  const map = {}
  const [numstat = '', untracked = ''] = stripExit(observed).split('---UNTRACKED---')
  for (const line of numstat.split('\n')) {
    if (isExitLine(line)) continue
    const f = line.split('\t')
    if (f.length >= 3 && f[2].trim()) map[f[2].trim()] = `${f[0]},${f[1]}`
  }
  for (const p of untracked.split('\n')) {
    if (p.trim() && !isExitLine(p)) map[p.trim()] = 'untracked'
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
// true.
//
// TWO LAYERS, because they fail differently:
//
//   1. PREVENTION - `hooks/gated-write-boundary.mjs`, wired as a PreToolUse
//      hook in the target repo's settings.json. Deterministic shell, exit 2,
//      zero tokens, and it stops the write before it lands.
//   2. DETECTION - what follows here. Compares the working-tree changeset
//      before and after each phase and rolls back anything out of bounds.
//
// The detection layer is NOT redundant. A hook that is not installed, or that
// does not fire for subagents spawned inside a Workflow run, enforces nothing
// while looking installed - see scripts/hook-selftest.mjs in this repo for two
// real precedents of exactly that. Until a run proves the hook fires here, this
// is the layer actually holding the line, and it costs no extra probe call
// because the tree capture rides along in the phase's gate batch.
//
// Comparing CHANGESETS rather than watching writes also catches something no
// write interceptor can: a path that was dirty before and is clean now was
// reverted, and reverting is modifying.
// ─────────────────────────────────────────────────────────────────────────────

const WRITES = {
  'gated-framer': [],                              // [] = read-only with respect to the repo
  'gated-planner': ['specs/', `${HANDOFF}/`],
  'gated-reviewer': [],                            // a reviewer that cannot fix does not quietly fix
  // Both patterns are needed: `**/*.md` requires a directory separator, so it
  // matches docs/a.md and misses README.md at the root entirely.
  'gated-documenter': ['docs/', '*.md', '**/*.md'],
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

// PROTECTED IS CHECKED FIRST, AND THAT ORDER IS THE WHOLE RULE.
//
// Testing the allow list first makes "nobody edits their own evaluator"
// conditional on no agent's allow pattern happening to reach a protected path -
// and the documenter's `**/*.md` reaches `.claude/agents/*.md` and
// `.claude/commands/*.md` exactly. An allow list is a widening; a protected
// path is a floor. A widening must never be evaluated before the floor.
function permitted(path, agentType) {
  if (PROTECTED.some(p => matches(path, p))) return false      // nobody edits their own evaluator
  const allow = WRITES[agentType]
  if (path.startsWith(`${HANDOFF}/`) || path.startsWith('.claude/runs/')) return true
  if ((allow || []).some(p => matches(path, p))) return true   // naming a path is what unlocks it
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
    // `status` is about the agent, `approved` is about the code, and a reviewer
    // that conflates them ends the run instead of triggering a revision.
    //
    // `status: 'fail'` means "I could not review" and kills the phase outright -
    // no revise, no second look. `approved: false` with blocking items is the
    // loop working. One real run was lost to this exact confusion: review 1
    // returned success/false and the builder revised correctly, then review 2
    // found one genuine remaining gap - a missing test for one guard - and
    // reported it as `status: 'fail'`. A revision round was sitting unused.
    //
    // Caught here rather than left to the prompt, because a prompt is a soft
    // guarantee and this costs an hour of work when it slips. A refutation
    // costs one more review call and the retry carries the observation
    // verbatim, so the reviewer is told precisely what it did.
    if (c.status === 'fail' && typeof c.approved === 'boolean' && (blocking.length || unmet.length)) {
      out.push(
        `status='fail' while returning a complete verdict (approved=${c.approved}, ` +
        `${blocking.length} blocking item(s), ${unmet.length} unmet requirement(s)). ` +
        `status is about YOU - it is 'success' whenever you reached a verdict at all, ` +
        `however negative. Rejecting the code is approved=false with blocking items, and ` +
        `that routes to a revision. status='fail' means you could NOT review, and it ends ` +
        `the run with the code uncommitted.`)
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
  // Refuse a path that would have to be escaped to reach the shell. The probe
  // does not reproduce an escape sequence reliably - it doubled a backslash on
  // the first real run - so the fix is to never emit one, and a path exotic
  // enough to need escaping is a phase-level problem, not a quoting problem.
  shell_safe: (c, { field }) =>
    (Array.isArray(c[field]) ? c[field] : [c[field]])
      .filter(v => v != null && v !== '' && !shellSafe(v))
      .map(v => `${field} entry ${JSON.stringify(v)} contains a character that cannot be passed to the shell safely`),

  // The write-up belongs to the documenter and rides in commit 3. A builder
  // that produces it too puts it inside commit 2, and then the documenter has
  // nothing left to commit - which is exactly how a run died with every single
  // check green: `git commit` reported "nothing to commit, working tree clean"
  // and no claim anyone made had been false.
  //
  // A CHECK and not a write-boundary entry, deliberately. A boundary breach is
  // fatal by design: the phase dies and the run ends, with no retry. But the
  // builder that did this was obeying its plan, which had listed the write-up
  // among the files to produce - the harshest possible outcome for the most
  // benign cause. A refutation hands back the observation and calls the builder
  // again, which is a correction rather than an execution.
  //
  // Scoped to what the builder DECLARES, so it cannot see a doc written and not
  // declared. That case is caught a phase later by `in_diff` on documentPath;
  // the two are independent nets on purpose.
  docs_not_yours: (c, { field }) =>
    (c[field] || [])
      .filter(p => typeof p === 'string' && /^docs\//.test(p))
      .map(p => `${p} is the documenter's to write, not yours: docs/ ships in commit 3 of 3, ` +
                `and a write-up committed with the code leaves that commit with nothing in it. ` +
                `Drop it from ${field} and leave the file alone - if the plan asked you for it, ` +
                `say so in notesForNextAgent and let the documenter write it.`),
}

const gateLog = []

// The working-tree capture rides along in every gate batch rather than costing
// its own probe call. Nothing runs between a phase's gate and its boundary
// check, so one observation answers both questions - and the probe is the
// expensive part of a gate, not the checks inside it.
const TREE_ID = 'the working tree'

async function gate(claim, checks, phaseName) {
  const violations = []
  const world = [{ type: 'capture', id: TREE_ID, command: TREE_CMD }]

  for (const c of checks) {
    if (PURE[c.type]) violations.push(...PURE[c.type](claim, c))
    else world.push(c)
  }

  // The tree row rides in this batch and settle() parses it into the rollback
  // decision, so this is a fingerprint call.
  const report = await probe(world, `gate:${phaseName}`, { phase: 'Gate', model: FINGERPRINT_MODEL })
  // The tree row is evidence for the write boundary, not a claim the agent
  // made, so a failure to read it is settle()'s problem and not a violation.
  violations.push(...report.failures.filter(f => !f.startsWith(`${TREE_ID}:`)))
  gateLog.push({ phase: phaseName, checks: report.rows.filter(r => r.id !== TREE_ID) })

  if (violations.length) gateLog.push({ phase: phaseName, violations })
  return { violations, report }
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

// `status: 'fail'` normally ends the phase immediately, and should: an agent
// that says it could not do its job has produced nothing worth checking, and
// gating it would spend an expensive retry to be told the same thing. That is
// the right outcome for a framer handed "build it" with no antecedent - it died
// in two minutes instead of guessing, which is the system working.
//
// The exception is an envelope that CONTRADICTS its own failure: a reviewer
// that reports `status: 'fail'` while returning a complete verdict did do its
// job, and just filed the result under the wrong field. Killing the run there
// throws away a revision round that was sitting unused - which is exactly how
// one run ended over a single missing test. So a self-contradicting claim gets
// its one cold retry like any other refuted claim, and `verdict_consistent`
// supplies the correction verbatim.
const contradictsOwnFailure = (c) =>
  c.status === 'fail' &&
  typeof c.approved === 'boolean' &&
  Boolean((c.blocking || []).length || (c.findings || []).some(f => !f.met))

async function gated(name, agentType, produce, checksFor) {
  const claim = await produce()
  if (!claim) throw new Error(`${name}: the agent died - there is no claim to verify`)
  if (claim.status === 'fail' && !contradictsOwnFailure(claim)) {
    throw new Error(`${name}: the agent reported status=fail - ${claim.summary}`)
  }

  const first = await gate(claim, checksFor(claim), name)
  let final = claim
  let report = first.report

  if (first.violations.length) {
    log(`${name}: ${first.violations.length} claim(s) refuted, retrying cold`)
    const retry = await produce(claim, first.violations)
    if (!retry) throw new Error(`${name}: the retry died. Still unverified: ${first.violations[0]}`)

    const second = await gate(retry, checksFor(retry), `${name}-retry`)
    if (second.violations.length) {
      throw new Error(`${name}: never produced a verifiable claim - ${second.violations.join(' · ')}`)
    }
    final = retry
    report = second.report
  }

  // The deferral above buys a self-contradicting claim one correction, not a
  // free pass. If the retry still reports failure, the phase dies here as it
  // would have at the top - a claim that says its own author failed is not a
  // claim any later phase gets to act on, however well it validates.
  if (final.status === 'fail') {
    throw new Error(`${name}: the agent reported status=fail - ${final.summary}`)
  }

  // The boundary is judged on the FINAL tree against the state pinned before
  // this phase began, so it spans every attempt: a breach on the first try is
  // still a breach after a retry that verified.
  await settle(agentType, name, report)
  return final
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

// EVERY file the builder touched across EVERY call it was given, not just the
// last one.
//
// `build` is reassigned by each fix_N and revise_N, so committing
// `build.changedFiles` commits only whatever the final repair happened to
// touch. On the my-rag run that was 3 files out of 20: the whole walking
// skeleton - package.json, tsconfig.json, all of src/kernel and src/slices -
// would have been left behind while the run reported success, because the
// revision that closed the reviewer's one finding only edited chunk.ts.
//
// The original ports around this by committing with `git add -A`. Staging only
// verified paths is the better rule, but it only works if the verified set
// accumulates.
const declaredFiles = new Set()
const remember = (claim) => {
  for (const f of (claim && claim.changedFiles) || []) if (f) declaredFiles.add(f)
  return claim
}

let treeState = {}
let frame = null, plan = null, build = null, review = null, writeup = null
let test = null
let branchCreated = false

// Take one fingerprint, compare it to the last one, and enforce the boundary.
// One probe call per phase, not two: the "after" of phase N is the "before" of
// phase N+1, since nothing runs in between.
async function settle(agentType, label, report) {
  if (report.died) throw new Error(`${label}: could not read the working tree, so no claim about it can be trusted`)
  const after = parseFingerprint(report.observed(TREE_ID))
  const touched = changedPaths(treeState, after)
  const breaches = agentType ? touched.filter(p => !permitted(p, agentType)) : []
  treeState = after

  if (breaches.length) {
    // The tree started clean, so every breach was introduced by this run and
    // rolling it back cannot destroy uncommitted work of yours. That guarantee
    // is exactly what the dirty-tree abort buys.
    await probe(
      breaches.map((p, i) => ({ type: 'run', id: `rollback ${i}`, command: `git checkout -- ${shq(p)} 2>/dev/null || rm -f ${shq(p)}` })),
      `rollback:${label}`, { phase: 'Gate' },
    )
    // A breach is NOT a gate violation: the write already happened and no
    // re-prompt undoes it. The phase dies and every path is named.
    throw new Error(`${agentType} wrote outside its boundary: ${breaches.join(', ')} (rolled back)`)
  }
  return touched
}

// The run's scratch space never lands in a commit. An agent that declares a
// handoff file among its changedFiles is describing its own working notes, not
// the change - in the my-rag run the builder did exactly that and staged
// `.claude/runs/<id>/handoff/phase-1-revise-notes.md` into the code commit.
const committable = (paths) =>
  [...new Set((paths || []).filter(Boolean))]
    .filter(p => !p.startsWith('.claude/runs/'))
    .sort()

// Where each commit message lives. The PATH is composed by the script, so it is
// shell-safe by construction; the CONTENT is written by the agent that owns the
// message and is read by git through `-F`, so it never touches a command line.
const msgPathFor = (label) => `${HANDOFF}/commit-msg-${label}.txt`

// The message file is a claim like any other, so it is gated like one.
const commitMessageChecks = (commitLabel) => [
  { type: 'exists', id: `the ${commitLabel} message is on disk`, path: msgPathFor(commitLabel) },
  { type: 'min_bytes', id: `the ${commitLabel} message is not empty`, path: msgPathFor(commitLabel), bytes: 10 },
]

// What the agent is told, once, wherever a commit message is owed. The path is
// script-composed and the content never reaches a command line.
const writeMessageInstruction = (commitLabel, describes) =>
  `## Your commit message\n\n` +
  `Write ONE imperative subject line describing ${describes} to \`${msgPathFor(commitLabel)}\`, ` +
  `and return the same sentence as \`commitMessage\`.\n\n` +
  `The file is what git actually commits, read with \`git commit -F\`, which is why it exists: a ` +
  `message with an apostrophe in it cannot be passed on a command line through this pipeline. ` +
  `Plain text, one line, no quotes around it, no "Co-authored-by", no trailing prose.`

// Stage EXACTLY the paths a gate already verified. Never `git add -A`: that
// sweeps whatever else is lying around into a commit its author never wrote.
async function commit(paths, label, fallbackSubject) {
  const clean = committable(paths)
  if (!clean.length) throw new Error(`${label}: no verified path to commit`)

  const unsafe = clean.filter(p => !shellSafe(p))
  if (unsafe.length) {
    throw new Error(
      `${label}: cannot stage ${unsafe.join(', ')} - the path needs shell escaping, and an ` +
      `escaped command line does not survive the probe verbatim`)
  }

  const msgPath = msgPathFor(label)
  const report = await probe([
    // If the agent did not write its message file, fall back to a subject this
    // script composed. Both branches are script-authored text with nothing to
    // escape; git reads the message from the file, never from an argument.
    { type: 'run', id: 'message', command: `[ -s ${shq(msgPath)} ] || echo ${shq(fallbackSubject)} > ${shq(msgPath)}` },
    { type: 'run', id: 'add', command: `git add -- ${clean.map(shq).join(' ')}` },
    { type: 'run', id: 'commit', command: `git commit -F ${shq(msgPath)}` },
    { type: 'capture', id: 'subject', command: `head -1 ${shq(msgPath)}` },
    { type: 'capture', id: 'sha', command: 'git rev-parse --short HEAD' },
    { type: 'capture', id: 'tree', command: TREE_CMD },
  ], label, { phase: 'Gate', model: FINGERPRINT_MODEL })
  if (report.failures.length) throw new Error(`${label} failed: ${report.failures.join(' · ')}`)
  treeState = parseFingerprint(report.observed('tree'))

  const sha = report.observed('sha').trim()
  const subject = report.observed('subject').trim()
  commitsMade.push({ label, sha, message: subject, files: clean })
  log(`${label}: ${sha} - ${subject} (${clean.length} file${clean.length === 1 ? '' : 's'})`)
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
  // A run leaves its scratch behind, and untracked scratch is a dirty tree, so
  // without this the FIRST run poisons every run after it: preflight aborts on
  // the handoff files the previous run wrote. Excluded rather than gitignored
  // because `.gitignore` is the target repo's file and a workflow has no
  // business editing it; `.git/info/exclude` is local, does the same job, and
  // is what gnhf does with its own run metadata for the same reason.
  {
    type: 'run', id: 'exclude run metadata',
    command: 'mkdir -p .git/info && { grep -qxF .claude/runs/ .git/info/exclude 2>/dev/null || echo .claude/runs/ >> .git/info/exclude; }',
  },
  { type: 'capture', id: 'branch', command: 'git rev-parse --abbrev-ref HEAD' },
  { type: 'capture', id: 'baseline', command: 'git rev-parse HEAD' },
  { type: 'capture', id: 'tree', command: TREE_CMD },
], 'preflight', { phase: 'Preflight', model: FINGERPRINT_MODEL })

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
  frame = await gated('frame', 'gated-framer',
    phaseAgent('gated-framer', 'opus', FRAME_SCHEMA, null,
      '## Naming the branch\n\n' +
      'Run `git branch -a --sort=-committerdate | head -20` and derive the convention from the REAL ' +
      'branch names in this repo. Quote those names in `conventionEvidence`. Do not apply a generic ' +
      'convention you saw elsewhere: every repo names differently, and guessing produces a branch that ' +
      'looks like nothing else in the project.\n\n' +
      (testCommand
        ? `## The test command\n\nThe operator gave this run its test command: \`${testCommand}\`. ` +
          'You do not choose it, look for it, or second-guess it. Treat it as the definition of ' +
          '"verified" for this run and plan the work so that command can prove it.'
        : '## No test command\n\nThe operator gave this run no test command, so nothing in it can ' +
          'prove the code runs and the code will not be committed. Frame the work anyway - the plan ' +
          'still gets committed and the code still lands in the working tree for a human to check.')),
    () => [
      { type: 'slug_shape' },
      { type: 'branch_matches_intent' },
      // branchName reaches `git checkout -b` on a command line, so it is held
      // to the same bar as any other path this run passes to the shell.
      { type: 'shell_safe', field: 'branchName' },
      { type: 'no_placeholder', fields: ['understanding', 'conventionEvidence'] },
    ])
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
    'branch-free', { phase: 'Branch' },
  )
  if (!lookup.ok('the branch is free')) {
    return {
      accepted: false,
      reason: `the branch ${frame.branchName} already exists - running here would land this work on top of someone else's`,
      branch: frame.branchName,
      phases: phaseLog,
    }
  }
  const made = await probe([{ type: 'run', id: 'checkout', command: `git checkout -b ${shq(frame.branchName)}` }], 'branch', { phase: 'Branch' })
  if (made.failures.length) throw new Error(`could not create ${frame.branchName}: ${made.failures.join(' · ')}`)
  branchCreated = true
  record('branch', 'probe', 'success')
  log(`on ${frame.branchName}`)

  // ── Plan ───────────────────────────────────────────────────────────────────
  phase('Plan')
  plan = await gated('plan', 'gated-planner',
    phaseAgent('gated-planner', 'opus', PLAN_SCHEMA, frame,
      `Write the plan to \`specs/${frame.slug}-plan.md\` and return that exact path as \`planPath\`. ` +
      'That file is the plan; the envelope only announces it. It gets committed, which is why it goes ' +
      `in \`specs/\` and not in the handoff dir - the handoff dir is this run's scratch space and its ` +
      'contents are not meant to outlive the run.\n\n' +
      'The reviewer will use this file as its spec, so a requirement the plan does not name is a ' +
      'requirement nobody will verify.' +
      (testCommand
        ? `\n\nThe run is verified by \`${testCommand}\`. Write the Verification section against that ` +
          'command specifically - it is the operator\'s, not a suggestion, and not something to replace.'
        : '') +
      '\n\n' + writeMessageInstruction('commit_plan', 'the plan document you just wrote')),
    (c) => [
      { type: 'no_placeholder', fields: ['summary', 'planPath'] },
      { type: 'shell_safe', field: 'planPath' },
      { type: 'exists', id: 'the plan is on disk', path: c.planPath },
      { type: 'min_bytes', id: 'the plan is not a stub', path: c.planPath, bytes: 500 },
      ...commitMessageChecks('commit_plan'),
    ])
  record('plan', 'gated-planner', 'success')

  // Commit 1 of 3: the spec goes on record before any code exists to blur it.
  // The words are the planner's, about the planner's work product.
  await commit([plan.planPath], 'commit_plan', `docs: add the plan for ${frame.slug}`)
  record('commit_plan', 'probe', 'success')

  // ── Build ──────────────────────────────────────────────────────────────────
  phase('Build')
  const buildChecks = (c) => [
    { type: 'counts_match', field: 'changedFiles', count: 'fileCount' },
    { type: 'shell_safe', field: 'changedFiles' },
    { type: 'docs_not_yours', field: 'changedFiles' },
    // `in_diff` ONLY. Never `exists`: a deletion is a change, and a deleted
    // file does not exist.
    //
    // Run 2 died on exactly this. The builder moved src/slices/search/merge.ts
    // to src/kernel/merge.ts and correctly declared both the new path and the
    // old one. In the same gate, `in_diff` passed on the old path - git reports
    // the deletion - while `exists` failed on it, and the phase was refuted
    // twice over a claim that was true.
    //
    // There was no way out for the builder either: dropping the deleted paths
    // makes the gate pass but leaves the deletions unstaged, so the commit
    // would keep the files it just moved away from. `exists` was also redundant
    // - a path that was never touched fails `in_diff` anyway - so it bought
    // nothing and cost every refactor that moves or removes a file.
    ...eachPath('in_diff', 'declared file is in the diff', c.changedFiles),
    // Written by the FIRST build call and never overwritten by a repair: the
    // commit covers the whole work product, so its subject is the build's, not
    // whatever the last fix happened to touch.
    ...commitMessageChecks('commit_build'),
  ]
  build = remember(await gated('build', 'gated-builder',
    phaseAgent('gated-builder', 'sonnet', BUILD_SCHEMA, plan,
      `Your spec is \`${plan.planPath}\`. Read it in full before writing anything.\n\n` +
      'Report every file you changed in `changedFiles`. That verified list becomes part of the ' +
      'commit\'s file list: a file you touched but did not declare will not be committed.\n\n' +
      writeMessageInstruction('commit_build', 'the code change as a whole') +
      '\nThis one subject covers the finished feature, including any repair a later phase makes to ' +
      'it, so write it about the change you were asked for rather than about what you did last.'),
    buildChecks))
  record('build', 'gated-builder', 'success')

  // ── Test, and the bounded fix loop ─────────────────────────────────────────
  // Running the suite is a known command, so the probe runs it. No agent has to
  // rediscover the test runner, and no context window is spent learning what a
  // subprocess already knows.
  if (testCommand) {
    for (let i = 1; i <= MAX_FIX_LOOPS; i++) {
      phase('Test')
      // The suite's output goes to a FILE, and only the exit code comes back
      // through the probe.
      //
      // The probe is a haiku transcribing into a JSON string, and its own
      // definition permits truncating long output. Routing a few thousand lines
      // of test log through that is asking a small model to be a pipe: the
      // builder's "verbatim output" would be whatever survived retyping, and
      // the run pays output tokens to re-emit a log that already exists on
      // disk. Redirected, the probe transcribes one exit code, and the builder
      // reads the real bytes with Read. This is what the system being ported
      // does - it writes command.log and hands over a bounded tail.
      const logPath = `${HANDOFF}/test-${i}.log`
      const run = await probe(
        [{ type: 'exits_zero', id: 'suite', command: redirected(testCommand, logPath) }],
        `test_${i}`, { phase: 'Test' },
      )
      test = { passed: run.ok('suite'), exitCode: run.ok('suite') ? 0 : 1, logPath }
      record(`test_${i}`, 'probe', 'success')
      if (test.passed) { log(`suite green on attempt ${i}`); break }
      if (i === MAX_FIX_LOOPS) { log(`suite still red after ${MAX_FIX_LOOPS} attempts`); break }

      log(`suite red, fix ${i} of ${MAX_FIX_LOOPS - 1}`)
      phase('Build')
      build = remember(await gated(`fix_${i}`, 'gated-builder',
        phaseAgent('gated-builder', 'sonnet', BUILD_SCHEMA, build,
          `The suite failed: \`${testCommand}\` exited non-zero.\n\n` +
          `Its complete output is at \`${logPath}\`. Read that file in full before you change ` +
          'anything - it is the real log, not a summary, and a suite that reports five failures gave ' +
          'you five things to fix. Address every failure it reports, not just the first.\n\n' +
          `Report only what THIS repair touched in \`changedFiles\`; the workflow already remembers ` +
          `everything the earlier calls declared. Leave \`${msgPathFor('commit_build')}\` alone - the ` +
          'commit subject describes the whole change, and a repair is part of it, not a replacement for it.'),
        buildChecks))
      record(`fix_${i}`, 'gated-builder', 'success')
    }
  } else {
    // No suite means nothing in this run can prove the code runs. Marking that
    // as passed would be the exact failure this package exists to prevent: an
    // unverified claim treated as a verified one, and `accepted: true` on a
    // build nobody executed. Unverified is failed, including here.
    test = { passed: false, exitCode: null, noSuite: true }
    log('no test command was given - the code cannot be verified, so it will not be committed')
  }

  // ── Review, and the bounded revision loop ──────────────────────────────────
  // A different question from the suite's. The suite asks "does it run"; the
  // review asks "is this what was asked for". Neither answers the other.
  let revised = false
  for (let i = 1; i <= MAX_REVISION_LOOPS; i++) {
    phase('Review')
    review = await gated(`review_${i}`, 'gated-reviewer',
      phaseAgent('gated-reviewer', 'opus', REVIEW_SCHEMA, build,
        `Your spec is \`${plan.planPath}\`. Judge the code on disk, never the builder's summary of it: ` +
        `start from its changedFiles, read them, and use \`git diff\` for anything the envelope did not mention.`),
      () => [{ type: 'verdict_consistent' }])
    record(`review_${i}`, 'gated-reviewer', 'success')

    if (review.approved || i === MAX_REVISION_LOOPS) break

    log(`review ${i} blocked on ${review.blocking.length} item(s), revising`)
    phase('Build')
    build = remember(await gated(`revise_${i}`, 'gated-builder',
      phaseAgent('gated-builder', 'sonnet', BUILD_SCHEMA, review,
        `The reviewer blocked this build. Close every one of these, and nothing else:\n\n- ${review.blocking.join('\n- ')}\n\n` +
        'Report only what THIS revision touched in `changedFiles`; the workflow already remembers ' +
        `everything the earlier calls declared. Leave \`${msgPathFor('commit_build')}\` alone - the ` +
        'commit subject describes the whole change, and a revision is part of it, not a replacement for it.'),
      buildChecks))
    record(`revise_${i}`, 'gated-builder', 'success')
    revised = true
  }

  // A revision edited code after the suite last ran, so the green light is
  // stale. Re-run rather than commit on a result that predates the change.
  if (revised && review.approved && testCommand) {
    phase('Test')
    const logPath = `${HANDOFF}/test-retest.log`
    const run = await probe(
      [{ type: 'exits_zero', id: 'suite', command: redirected(testCommand, logPath) }],
      'retest', { phase: 'Test' },
    )
    test = { passed: run.ok('suite'), exitCode: run.ok('suite') ? 0 : 1, logPath }
    record('retest', 'probe', 'success')
  }

  const verified = Boolean(test && test.passed && review && review.approved)

  // Red tests or a rejected review stop the chain here. The code stays
  // uncommitted and nothing is documented, because there is nothing worth
  // describing yet. The plan commit stands: it is a record of what was asked.
  if (verified) {
    // The union was gated call by call, but each entry was verified at the
    // moment its own call returned - a path the build created and a later
    // revision deleted would still be in the set. Re-check the whole set once,
    // against the tree that is about to be committed.
    const union = committable([...declaredFiles])
    if (!union.length) throw new Error('the builder never declared a committable file')
    const settled = await probe(
      union.map((p, i) => ({ type: 'in_diff', id: `still changed: ${p}`, path: p })),
      'union', { phase: 'Gate' },
    )
    if (settled.failures.length) {
      throw new Error(
        `the accumulated change set no longer matches the tree: ${settled.failures.join(' · ')}`)
    }
    log(`${union.length} file(s) verified across ${declaredFiles.size} declaration(s)`)

    // Commit 2 of 3: the code lands only now - green suite, approved review.
    await commit(union, 'commit_build', `${frame.intent}: ${frame.slug}`)
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
    ], 'changes', { phase: 'Document' })
    if (captured.failures.length) {
      throw new Error(`nothing changed since ${baseline.slice(0, 7)} - there is nothing to document: ${captured.failures.join(' · ')}`)
    }
    record('changes', 'probe', 'success')
    log(`diff captured: ${captured.observed('stat').trim()}`)

    // ── Document ─────────────────────────────────────────────────────────────
    writeup = await gated('document', 'gated-documenter',
      phaseAgent('gated-documenter', 'sonnet', DOCUMENT_SCHEMA, build,
        `Read ${diffPath} in full before writing. Document only what that diff shows - ` +
        'not the plan\'s promises, and not behaviour you believe exists elsewhere in the system.\n\n' +
        writeMessageInstruction('commit_docs', 'the write-up you just wrote')),
      (c) => [
        { type: 'no_placeholder', fields: ['documentPath'] },
        { type: 'shell_safe', field: 'documentPath' },
        // `in_diff`, not `exists`. The same distinction run 2 taught in the
        // build phase, arrived at here from the opposite direction: `exists`
        // answers for the disk, `in_diff` answers for the repo, and the only
        // question worth asking about a file that is one step from being
        // committed is the second one.
        //
        // A run died here with every check green. The builder had written the
        // write-up as part of its own work, so commit 2 took it, and by the
        // time this gate ran the file existed, was 6811 bytes, and was already
        // committed - `exists` and `min_bytes` were both correctly true. The
        // commit that followed found an empty index and reported "nothing to
        // commit, working tree clean" as an error nobody could read.
        //
        // The evidence was already in this gate's own probe batch: the tree row
        // that rides along for the write boundary showed a completely clean
        // tree, two lines above the check that passed. No check consulted it.
        { type: 'in_diff', id: 'the write-up is a pending change', path: c.documentPath },
        { type: 'min_bytes', id: 'the write-up is not a stub', path: c.documentPath, bytes: 400 },
        ...commitMessageChecks('commit_docs'),
      ])
    record('document', 'gated-documenter', 'success')

    // Commit 3 of 3: the write-up ships beside the code it describes.
    await commit([writeup.documentPath], 'commit_docs', `docs: write up ${frame.slug}`)
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
      'no test command was given to this run, so nothing in it proved the code runs. ' +
      'The plan is committed and the code is in the working tree, unverified and uncommitted, ' +
      'for you to check by hand. Re-run with testCommand set to verify it',
    !thrown && test && !test.passed && !test.noSuite &&
      `the suite never came back green (exit ${test.exitCode}) - its output is at ${test.logPath}`,
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
    // What the builder declared MINUS what actually landed in a commit.
    //
    // This used to report every declared path whenever `accepted` was false,
    // on the assumption that a run that did not finish did not commit. That
    // assumption breaks the moment a run gets past commit 2 and dies later: one
    // did, at commit 3, and reported 14 paths as uncommitted when all 14 were
    // sitting in the code commit and the tree was clean. Anyone reading that
    // report would conclude the run had lost a day of work. It had lost a
    // commit whose contents were already committed.
    //
    // Computed from `commitsMade`, which is only ever appended after a commit
    // the probe confirmed, so a path can only drop off this list by genuinely
    // having landed.
    uncommitted: committable([...declaredFiles])
      .filter(p => !commitsMade.some(c => (c.files || []).includes(p))),
    commits: commitsMade,

    // The evidence travels with the verdict, so the report cannot claim anything
    // the harness did not observe.
    evidence: {
      understanding: frame && frame.understanding,
      conventionEvidence: frame && frame.conventionEvidence,
      testCommand: testCommand || null,
      exitCode: test && test.exitCode,
      planPath: plan && plan.planPath,
      testLog: test && test.logPath,
      documentPath: writeup && writeup.documentPath,
      blocking: review && review.blocking,
    },
    gates: gateLog,
    phases: phaseLog,
  }
}

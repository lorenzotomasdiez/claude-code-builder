export const meta = {
  name: 'gnhf-backlog-maker',
  description: 'Turn a raw task into an exhaustive, verification-bearing, GNHF-ready backlog: scope the repo, decompose into sequenced vertical-slice rows (each with a real test and gate-chain check), adversarially critique for completeness/verification-rigor/sequencing, write the backlog.md file, and compose the ready-to-launch GNHF worker prompt',
  phases: [
    { title: 'Scope', detail: 'inspect the repo: relevant code/docs/tests, the real gate-chain commands, and any existing backlog to continue' },
    { title: 'Decompose', detail: 'break the task into an exhaustive, already-sequenced list of vertical-slice rows, each with a real test and verification (opus: completeness is the judgment call)' },
    { title: 'Draft', detail: 'assemble the rows into the actual backlog.md file, merging with any existing content' },
    { title: 'Critique', detail: 'parallel adversarial review: completeness, verification-rigor, sequencing/scope' },
    { title: 'Revise', detail: 'incorporate critique, re-review, repeat until clean or capped' },
  ],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    target: { type: 'string' },
    codePaths: { type: 'array', items: { type: 'string' } },
    existingDocPaths: { type: 'array', items: { type: 'string' } },
    existingTestPaths: { type: 'array', items: { type: 'string' } },
    gateCommands: {
      type: 'object',
      properties: {
        typecheck: { type: 'string' },
        lint: { type: 'string' },
        build: { type: 'string' },
        testUnit: { type: 'string' },
        testE2e: { type: 'string' },
      },
    },
    backlogPath: { type: 'string' },
    existingBacklogContent: { type: 'string' },
    highestExistingRowId: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['target', 'backlogPath'],
}

const ROWS_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          title: { type: 'string' },
          whatToDo: { type: 'string' },
          testToProve: { type: 'string' },
          verification: { type: 'array', items: { type: 'string' } },
          dependsOn: { type: 'array', items: { type: 'number' } },
          status: { type: 'string', enum: ['todo'] },
        },
        required: ['id', 'title', 'whatToDo', 'testToProve', 'verification'],
      },
    },
    nonGoals: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
  },
  required: ['rows'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['ready', 'needs_revision'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'verdict', 'issues'],
}

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

const task = typeof input === 'string' ? input : input && input.task
if (!task) {
  throw new Error(
    'Missing the task. Call this workflow with args set to either a plain string ' +
    '(the raw task description, e.g. "update all the design docs, write the tests and implementations, and verify everything works") ' +
    'or an object shaped { "task": "...", "backlogPath": "optional, default docs/build-plan/backlog.md" }.'
  )
}
const backlogPathHint = (input && typeof input === 'object' && input.backlogPath) || 'docs/build-plan/backlog.md'

// --- Phase 1: Scope ---
phase('Scope')
const scope = await agent(
  `Scope this task for a GNHF-ready backlog: "${task}". The conventional backlog path is ${backlogPathHint} - check whether it already exists and, if so, read its full content and the highest row id present. Find the relevant code, docs (especially anything the task implies updating, like design docs), and existing tests. Detect the repo's REAL gate-chain commands (typecheck, lint, build, unit tests, e2e) - do not invent one that doesn't exist. Map the terrain; do not decompose the task into rows.`,
  { agentType: 'gbm-scoper', schema: SCOPE_SCHEMA }
)
log(`Scope ready: backlog at ${scope.backlogPath}${scope.highestExistingRowId ? ` (continuing from row ${scope.highestExistingRowId})` : ' (new)'}`)

// --- Phase 2: Decompose ---
phase('Decompose')
const decomposed = await agent(
  `Break this task into an EXHAUSTIVE, already-sequenced list of vertical-slice backlog rows - nothing implied by the task may be missing, vague, or lumped into a catch-all row. Each row must carry a real test and real verification drawn from the scope's gate-chain commands.\n\nTask: "${task}"\n\nScope:\n${JSON.stringify(scope, null, 2)}`,
  { agentType: 'gbm-decomposer', schema: ROWS_SCHEMA }
)
log(`Decompose ready: ${decomposed.rows.length} row(s) proposed`)

// --- Phase 3: Draft ---
phase('Draft')
let backlogDoc = await agent(
  `Assemble this task's rows into the actual backlog.md document. If existing backlog content is non-empty, APPEND these new rows after it, preserving every existing row byte-for-byte - do not overwrite or reorder anything already there.\n\nTask: ${task}\n\nExisting backlog content (may be empty):\n${scope.existingBacklogContent || '(none - this is a new backlog)'}\n\nNew rows:\n${JSON.stringify(decomposed, null, 2)}`,
  { agentType: 'gbm-backlog-writer' }
)

// --- Phase 4/5: Critique -> Revise loop (parallel critics, capped rounds) ---
const CRITIC_LENSES = [
  { key: 'completeness', agentType: 'gbm-completeness-critic' },
  { key: 'verification', agentType: 'gbm-verification-critic' },
  { key: 'sequencing', agentType: 'gbm-sequencing-critic' },
]
const MAX_ROUNDS = 2
let round = 0
let allCritiques = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIC_LENSES.map(lens => () =>
    agent(
      `Critique this GNHF backlog through your assigned lens. Be adversarial.\n\nOriginal task: ${task}\n\nScope (including the repo's real gate-chain commands):\n${JSON.stringify(scope, null, 2)}\n\nBacklog document:\n${backlogDoc}`,
      { agentType: lens.agentType, label: `critique:${lens.key}`, phase: 'Critique', schema: CRITIQUE_SCHEMA }
    )
  ))).filter(Boolean)
  allCritiques = critiques

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  if (needsWork.length === 0) {
    log('All lenses signed off - backlog is ready')
    break
  }

  round++
  if (round >= MAX_ROUNDS) {
    log(`Round cap (${MAX_ROUNDS}) reached with ${needsWork.length}/${critiques.length} lenses still flagging issues - returning best draft`)
    break
  }

  phase('Revise')
  log(`Revising: ${needsWork.length}/${critiques.length} lenses flagged issues (round ${round})`)
  backlogDoc = await agent(
    `Revise this backlog to address the following critique. Keep every row that already works and was not flagged, and never touch a row that came from a pre-existing backlog.\n\nCurrent backlog:\n${backlogDoc}\n\nCritique:\n${JSON.stringify(needsWork, null, 2)}`,
    { agentType: 'gbm-backlog-writer' }
  )
}

// --- Compose the GNHF launch prompt (deterministic - the skeleton is fixed, no agent needed) ---
const gateChainEntries = Object.entries(scope.gateCommands || {}).filter(([, cmd]) => cmd)
const gateChainList = gateChainEntries.length
  ? gateChainEntries.map(([, cmd]) => cmd).join(', ')
  : 'this repo\'s standard checks (none were detected automatically - confirm before launch)'
const nonGoalsBlock = (decomposed.nonGoals || []).length
  ? `\n\nDo not touch anything outside these rows, in particular: ${decomposed.nonGoals.join('; ')}.`
  : ''
const docsHint = (scope.existingDocPaths || []).length
  ? ` Also read ${scope.existingDocPaths.join(', ')} for the obligations each row references.`
  : ''

const gnhfPrompt = `Objective: ${task}, row by row, until every row in ${scope.backlogPath} is done.

Treat this as a long-running GNHF task. Before coding each iteration, read ${scope.backlogPath} to find the next todo row and its verification requirements.${docsHint}

Work one row at a time, marking it in-progress and then done. Each row ships together with its verification - a row without its check does not count as done. Commit after each row.${nonGoalsBlock}

Preserve any existing user changes in the repo. Do not weaken or skip an existing test to make a row pass.

After each row, run the gate chain (${gateChainList}) and record the result in the row. If a row is genuinely blocked, do not fake completion - mark it blocked in ${scope.backlogPath} with the blocker and the evidence, skip it, and continue with the next row.

Stop only when: every row in ${scope.backlogPath} is marked done, its gate chain is green, and no row is left in progress or blocked without an explicit escalation note.`

return { scope, decomposed, backlogDoc, critiques: allCritiques, gnhfPrompt, backlogPath: scope.backlogPath }

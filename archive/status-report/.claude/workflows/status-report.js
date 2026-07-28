export const meta = {
  name: 'status-report',
  description: 'Synthesize real git activity and optional ticket context into stakeholder-readable status updates, tuned per audience',
  phases: [
    { title: 'Scope', detail: 'normalize the period, audiences, and repo scope from the raw request' },
    { title: 'Gather', detail: 'pull real git log/diff activity and fold in any supplied ticket context' },
    { title: 'Draft', detail: 'per audience: draft -> adversarial critique (accuracy, audience-fit) -> capped revise' },
  ],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    periodDescription: { type: 'string' },
    gitSinceRef: { type: 'string' },
    audiences: { type: 'array', items: { type: 'string' } },
    repoScope: { type: 'string' },
    ticketContext: { type: 'string' },
    focusNotes: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['gitSinceRef', 'audiences'],
}

const FACTS_SCHEMA = {
  type: 'object',
  properties: {
    commitCount: { type: 'number' },
    commits: {
      type: 'array',
      items: {
        type: 'object',
        properties: { hash: { type: 'string' }, summary: { type: 'string' } },
        required: ['summary'],
      },
    },
    filesChanged: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
    ticketNotes: { type: 'string' },
    periodCovered: { type: 'string' },
  },
  required: ['commitCount', 'highlights'],
}

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    audience: { type: 'string' },
    report: { type: 'string' },
  },
  required: ['audience', 'report'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string', enum: ['accuracy', 'audience-fit'] },
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

const request = typeof input === 'string' ? input : input && input.request
if (!request) {
  throw new Error(
    'Missing the status-report request. Call this workflow with args set to either a plain string ' +
    '(describing the period/audiences/tickets) or an object shaped { "request": "..." }.'
  )
}

// --- Phase 1: Scope (single agent) ---
phase('Scope')
const scope = await agent(
  `Turn this raw status-report request into a structured scope brief: "${request}"`,
  { agentType: 'status-scoper', schema: SCOPE_SCHEMA }
)
log(`Scope ready - period: ${scope.periodDescription || scope.gitSinceRef}, audiences: ${scope.audiences.join(', ')}`)

// --- Phase 2: Gather (single agent, real git activity) ---
phase('Gather')
const facts = await agent(
  `Gather real git activity and fold in any ticket context for this status report.\nGit since-ref: ${scope.gitSinceRef}\nRepo scope: ${scope.repoScope || 'current working directory'}\nFocus notes: ${scope.focusNotes || 'none'}\nTicket context: ${scope.ticketContext || 'none supplied'}`,
  { agentType: 'status-gatherer', schema: FACTS_SCHEMA }
)
log(`Gathered ${facts.commitCount} commit(s), ${facts.highlights.length} highlight(s)`)

// --- Phase 3: per-audience Draft -> Critique (accuracy, audience-fit) -> capped Revise ---
phase('Draft')
const MAX_REVISE_ROUNDS = 2

async function processAudience(audienceName) {
  let draft = await agent(
    `Draft a status report for the "${audienceName}" audience from these facts.\nFacts:\n${JSON.stringify(facts, null, 2)}`,
    { agentType: 'status-writer', label: `draft:${audienceName}`, phase: 'Draft', schema: DRAFT_SCHEMA }
  )

  let round = 0
  let critiques = []
  while (round < MAX_REVISE_ROUNDS) {
    critiques = (await parallel(['accuracy', 'audience-fit'].map(lens => () =>
      agent(
        `Critique this status report through the ${lens} lens.\nAudience it claims to be tuned for: ${draft.audience}\nDraft:\n${draft.report}\n\nGathered facts it should trace back to:\n${JSON.stringify(facts, null, 2)}`,
        { agentType: 'status-critic', label: `critique:${audienceName}:${lens}`, phase: 'Draft', schema: CRITIQUE_SCHEMA }
      )
    ))).filter(Boolean)

    const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
    if (needsWork.length === 0) break

    round++
    if (round >= MAX_REVISE_ROUNDS) {
      log(`Round cap (${MAX_REVISE_ROUNDS}) reached for ${audienceName} - ${needsWork.length}/${critiques.length} lenses still flagging issues, returning best draft`)
      break
    }

    log(`Revising ${audienceName} report: ${needsWork.length}/${critiques.length} lenses flagged issues (round ${round})`)
    draft = await agent(
      `Revise this status report to address the critique below. Keep everything that already works and was not flagged.\nAudience: ${draft.audience}\nCurrent draft:\n${draft.report}\nCritique:\n${JSON.stringify(needsWork, null, 2)}`,
      { agentType: 'status-writer', label: `revise:${audienceName}`, phase: 'Draft', schema: DRAFT_SCHEMA }
    )
  }

  return { audience: audienceName, report: draft.report, critiques }
}

const reports = await pipeline(scope.audiences, processAudience)

return { scope, facts, reports: reports.filter(Boolean) }

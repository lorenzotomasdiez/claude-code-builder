export const meta = {
  name: 'release-readiness',
  description: 'Go/no-go release readiness check: independent parallel gates over tests, security, docs, migrations, and rollback plan, synthesized into one report that is blocking if any gate fails',
  phases: [
    { title: 'Scope', detail: 'summarize what is shipping and where' },
    { title: 'Gates', detail: 'five independent parallel gates: tests, security, docs, migrations, rollback' },
    { title: 'Report', detail: 'synthesize gate verdicts into one go/no-go report' },
  ],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    changedAreas: { type: 'array', items: { type: 'string' } },
    targetEnvironment: { type: 'string' },
    releaseType: { type: 'string' },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'targetEnvironment'],
}

const GATE_SCHEMA = {
  type: 'object',
  properties: {
    gate: { type: 'string' },
    status: { type: 'string', enum: ['pass', 'warn', 'fail'] },
    blocking: { type: 'boolean' },
    evidence: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['gate', 'status', 'blocking', 'reasoning'],
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

const target = typeof input === 'string' ? input : input && input.target
if (!target) {
  throw new Error(
    'Missing the release target. Call this workflow with args set to either a plain string ' +
    '(a description of what is shipping and where) or an object shaped ' +
    '{ "target": "...", "context": "optional extra release context" }.'
  )
}
const context = (input && typeof input === 'object' && input.context) || ''

// --- Phase 1: Scope (single agent, sequential) ---
phase('Scope')
const scope = await agent(
  `Build a release brief for this release readiness check. Context: ${context || 'none supplied'}.\n\nRelease target:\n${target}`,
  { agentType: 'release-readiness-scoper', schema: SCOPE_SCHEMA }
)
log(`Scope ready: ${(scope.changedAreas || []).length} changed area(s), target env: ${scope.targetEnvironment}`)

// --- Phase 2: Gates (five independent parallel gates) ---
phase('Gates')
const GATES = [
  { key: 'tests', agentType: 'release-readiness-gate-tests' },
  { key: 'security', agentType: 'release-readiness-gate-security' },
  { key: 'docs', agentType: 'release-readiness-gate-docs' },
  { key: 'migrations', agentType: 'release-readiness-gate-migrations' },
  { key: 'rollback', agentType: 'release-readiness-gate-rollback' },
]

function gatePrompt(gateKey) {
  return `Check the ${gateKey} gate only for this release. Report your verdict independently - you cannot see the other gates' results.\n\nRelease brief:\n${JSON.stringify(scope, null, 2)}\n\nRelease target:\n${target}`
}

const gateResults = await parallel(GATES.map(g => () =>
  agent(gatePrompt(g.key), { agentType: g.agentType, label: `gate:${g.key}`, phase: 'Gates', schema: GATE_SCHEMA })
))

const gates = gateResults.filter(Boolean)
// A failing gate blocks the release even if the agent forgot to set blocking=true.
const blockingGates = gates.filter(g => g.blocking || g.status === 'fail')
log(`${gates.length}/${GATES.length} gates reported, ${blockingGates.length} blocking`)

// --- Phase 3: Report (single agent, sequential) ---
phase('Report')
const report = await agent(
  `Synthesize these five independent release-gate verdicts into one go/no-go release readiness report. Rule: any gate with blocking=true means the overall verdict is no-go, no exceptions.\n\nRelease brief:\n${JSON.stringify(scope, null, 2)}\n\nGate verdicts:\n${JSON.stringify(gates, null, 2)}`,
  { agentType: 'release-readiness-reporter' }
)

const verdict = blockingGates.length > 0 ? 'no-go' : (gates.some(g => g.status === 'warn') ? 'conditional-go' : 'go')

return { scope, gates, verdict, report }

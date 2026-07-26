export const meta = {
  name: 'perf-investigation',
  description: 'Investigate a performance symptom: five independent hotspot lenses (algorithmic, I/O/database, concurrency, memory/GC, infra) hypothesize causes in parallel, each hypothesis is independently evidence-checked against the real target, then surviving issues are ranked by impact with a concrete fix and expected gain each',
  phases: [
    { title: 'Scope', detail: 'map affected paths, known metrics, load characteristics, and instrumentation' },
    { title: 'Hypothesize', detail: 'parallel fan-out: algorithmic, I/O/database, concurrency, memory/GC, infra lenses' },
    { title: 'Evidence', detail: 'independently gather evidence for or against each hypothesis' },
    { title: 'Report', detail: 'rank surviving issues by impact with a proposed fix and expected gain (opus: judgment-heavy)' },
  ],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    affectedPaths: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          location: { type: 'string' },
          kind: { type: 'string' },
        },
        required: ['location', 'kind'],
      },
    },
    knownMetrics: { type: 'array', items: { type: 'string' } },
    loadCharacteristics: { type: 'array', items: { type: 'string' } },
    existingInstrumentation: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: ['affectedPaths'],
}

const HYPOTHESIS = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'number' },
    impact: { type: 'string', enum: ['high', 'medium', 'low'] },
    mechanism: { type: 'string' },
    failure_scenario: { type: 'string' },
  },
  required: ['title', 'mechanism', 'impact'],
}

const HYPOTHESES_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    hypotheses: { type: 'array', items: HYPOTHESIS },
  },
  required: ['lens', 'hypotheses'],
}

const EVIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'plausible', 'rejected'] },
    reasoning: { type: 'string' },
    evidence: { type: 'string' },
    estimatedGain: { type: 'string' },
  },
  required: ['verdict', 'reasoning'],
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
    'Missing the target to investigate. Call this workflow with args set to either a plain string ' +
    '(a performance symptom description, plus the code it points at) or an object shaped ' +
    '{ "target": "...", "context": "optional known metrics/profiling notes" }.'
  )
}
const context = (input && typeof input === 'object' && input.context) || ''

// --- Phase 1: Scope (single agent, sequential) ---
phase('Scope')
const scope = await agent(
  `Build a baseline brief for this performance investigation. Context: ${context || 'none supplied'}.\n\nTarget:\n${target}`,
  { agentType: 'perf-investigation-scoper', schema: SCOPE_SCHEMA }
)
log(`Scope ready: ${scope.affectedPaths.length} affected path(s), ${(scope.knownMetrics || []).length} known metric(s)`)

// --- Phase 2/3: Hypothesize (parallel lenses) -> Evidence (parallel per hypothesis), pipelined per lens ---
const LENSES = [
  { key: 'algorithmic', agentType: 'perf-investigation-algorithmic-lens' },
  { key: 'io_database', agentType: 'perf-investigation-io-lens' },
  { key: 'concurrency', agentType: 'perf-investigation-concurrency-lens' },
  { key: 'memory_gc', agentType: 'perf-investigation-memory-lens' },
  { key: 'infra_deployment', agentType: 'perf-investigation-infra-lens' },
]

function hypothesizePrompt(lens) {
  return `Hypothesize performance hotspots in this target through the ${lens.key} lens only. Be concrete - only report a hypothesis you can state a plausible triggering condition for.\n\nBaseline brief:\n${JSON.stringify(scope, null, 2)}\n\nTarget:\n${target}`
}

function evidencePrompt(hypothesis, lensKey) {
  return `Independently gather evidence for or against this ${lensKey} hypothesis by re-checking it against the actual target. Default to skepticism.\n\nHypothesis:\n${JSON.stringify(hypothesis, null, 2)}\n\nTarget:\n${target}`
}

const evidencedByLens = await pipeline(
  LENSES,
  lens => agent(hypothesizePrompt(lens), { agentType: lens.agentType, label: `hypothesize:${lens.key}`, phase: 'Hypothesize', schema: HYPOTHESES_SCHEMA }),
  (result, lens) => {
    if (!result || !result.hypotheses || result.hypotheses.length === 0) return []
    return parallel(result.hypotheses.map(h => () =>
      agent(evidencePrompt(h, lens.key), { agentType: 'perf-investigation-evidence-gatherer', label: `evidence:${lens.key}:${h.title}`, phase: 'Evidence', schema: EVIDENCE_SCHEMA })
        .then(e => ({ ...h, lens: lens.key, evidence: e }))
    ))
  }
)

const allHypotheses = evidencedByLens.flat().filter(Boolean)
const surviving = allHypotheses.filter(h => h.evidence && (h.evidence.verdict === 'confirmed' || h.evidence.verdict === 'plausible'))
log(`${surviving.length}/${allHypotheses.length} hypotheses survived evidence-gathering`)

// --- Phase 4: Report (single agent, sequential) ---
phase('Report')
const report = await agent(
  `Synthesize these evidence-gathered performance hypotheses into one ranked report with a proposed fix and expected gain for each. If the list is empty, say so plainly.\n\nSurviving hypotheses:\n${JSON.stringify(surviving, null, 2)}`,
  { agentType: 'perf-investigation-reporter', model: 'opus' }
)

return { scope, allHypotheses, surviving, report }

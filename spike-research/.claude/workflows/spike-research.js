export const meta = {
  name: 'spike-research',
  description: 'Answer a "should we adopt X" or "how is Y usually solved" question: four independent multi-modal research lenses (official sources, community/real-world evidence, alternatives, risk/maintenance), each fact-checked by an adversarial verifier, synthesized into an options matrix and a recommendation with a stated confidence level',
  phases: [
    { title: 'Scope', detail: 'turn the raw question into decision type, options, criteria, constraints' },
    { title: 'Research', detail: 'parallel fan-out: official, community, alternatives, risk lenses' },
    { title: 'Verify', detail: 'independently fact-check each lens\'s findings, per lens' },
    { title: 'Synthesize', detail: 'options matrix and recommendation with a stated confidence level' },
  ],
}

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    decisionType: { type: 'string', enum: ['adopt-vs-not', 'how-is-this-solved', 'compare-options'] },
    options: { type: 'array', items: { type: 'string' } },
    criteria: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' } },
    confidenceNeeded: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['question', 'decisionType', 'criteria', 'confidenceNeeded'],
}

const FINDING = {
  type: 'object',
  properties: {
    claim: { type: 'string' },
    source: { type: 'string' },
    option: { type: 'string' },
  },
  required: ['claim'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: FINDING },
    risks: { type: 'array', items: { type: 'string' } },
    sourcesConsulted: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'findings'],
}

const VERIFIED_FINDING = {
  type: 'object',
  properties: {
    claim: { type: 'string' },
    option: { type: 'string' },
    verdict: { type: 'string', enum: ['verified', 'overstated', 'unverifiable'] },
    note: { type: 'string' },
  },
  required: ['claim', 'verdict'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    verifiedFindings: { type: 'array', items: VERIFIED_FINDING },
    overallConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['lens', 'verifiedFindings', 'overallConfidence'],
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

const question = typeof input === 'string' ? input : input && input.question
if (!question) {
  throw new Error(
    'Missing the research question. Call this workflow with args set to either a plain string ' +
    '(the question itself) or an object shaped { "question": "...", "context": "optional repo/stack context" }.'
  )
}
const context = (input && typeof input === 'object' && input.context) || ''

// --- Phase 1: Scope (single agent, sequential) ---
phase('Scope')
const brief = await agent(
  `Turn this raw research question into a structured spike-research brief. Context: ${context || 'none supplied'}.\n\nQuestion:\n${question}`,
  { agentType: 'spike-research-scoper', schema: BRIEF_SCHEMA }
)
log(`Brief ready (${brief.decisionType}, confidence needed: ${brief.confidenceNeeded}): ${brief.question}`)

// --- Phase 2/3: Research (parallel lenses) -> Verify (per lens), pipelined per lens ---
const LENSES = [
  { key: 'official', agentType: 'spike-research-official-lens' },
  { key: 'community', agentType: 'spike-research-community-lens' },
  { key: 'alternatives', agentType: 'spike-research-alternatives-lens' },
  { key: 'risk', agentType: 'spike-research-risk-lens' },
]

function researchPrompt(lens) {
  return `Investigate this spike-research brief through the ${lens.key} lens only.\n\nBrief:\n${JSON.stringify(brief, null, 2)}`
}

function verifyPrompt(findings, lensKey) {
  return `Independently fact-check these ${lensKey}-lens findings. Default to skepticism.\n\nFindings:\n${JSON.stringify(findings, null, 2)}`
}

const verifiedByLens = await pipeline(
  LENSES,
  lens => agent(researchPrompt(lens), { agentType: lens.agentType, label: `research:${lens.key}`, phase: 'Research', schema: FINDINGS_SCHEMA }),
  (result, lens) => {
    if (!result || !result.findings || result.findings.length === 0) {
      return { lens: lens.key, verifiedFindings: [], overallConfidence: 'low', risks: (result && result.risks) || [] }
    }
    return agent(verifyPrompt(result.findings, lens.key), { agentType: 'spike-research-verifier', label: `verify:${lens.key}`, phase: 'Verify', schema: VERIFY_SCHEMA })
      .then(v => ({ ...v, risks: result.risks || [] }))
  }
)

const allVerified = verifiedByLens.filter(Boolean)
const verifiedFindingCount = allVerified.reduce((n, v) => n + (v.verifiedFindings ? v.verifiedFindings.length : 0), 0)
log(`${allVerified.length}/${LENSES.length} lenses returned verified findings (${verifiedFindingCount} findings graded)`)

// --- Phase 4: Synthesize (single agent, sequential) ---
phase('Synthesize')
const report = await agent(
  `Synthesize these verified research findings into an options matrix and a recommendation with a stated confidence level. If the evidence base is too thin, say so plainly.\n\nBrief:\n${JSON.stringify(brief, null, 2)}\n\nVerified findings by lens:\n${JSON.stringify(allVerified, null, 2)}`,
  { agentType: 'spike-research-synthesizer' }
)

return { brief, verifiedByLens: allVerified, report }

export const meta = {
  name: 'code-review',
  description: 'Multi-lens adversarial review of a diff: correctness, security, performance, tests, readability run in parallel, findings adversarially verified, then ranked by severity',
  phases: [
    { title: 'Scope', detail: 'summarize the diff and flag risk areas for the lenses' },
    { title: 'Review', detail: 'parallel fan-out: correctness, security, performance, tests, readability lenses' },
    { title: 'Verify', detail: 'adversarially verify each finding to kill false positives (opus: judgment-heavy)' },
    { title: 'Report', detail: 'rank surviving findings by severity into one report' },
  ],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    filesTouched: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          changeType: { type: 'string' },
        },
        required: ['file', 'changeType'],
      },
    },
    stack: { type: 'string' },
    riskAreas: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: ['filesTouched'],
}

const FINDING = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'number' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    summary: { type: 'string' },
    failure_scenario: { type: 'string' },
  },
  required: ['title', 'summary', 'severity'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: FINDING },
  },
  required: ['lens', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'rejected'] },
    reasoning: { type: 'string' },
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

const diff = typeof input === 'string' ? input : input && input.diff
if (!diff) {
  throw new Error(
    'Missing the diff to review. Call this workflow with args set to either a plain string ' +
    '(the unified diff itself) or an object shaped { "diff": "...", "context": "optional PR title/description" }.'
  )
}
const context = (input && typeof input === 'object' && input.context) || ''

// --- Phase 1: Scope (single agent, sequential) ---
phase('Scope')
const scope = await agent(
  `Scope this diff for a multi-lens code review. Context: ${context || 'none supplied'}.\n\nDiff:\n${diff}`,
  { agentType: 'code-review-scoper', schema: SCOPE_SCHEMA, effort: 'low' }
)
log(`Scope ready: ${scope.filesTouched.length} file(s) touched, ${scope.riskAreas.length} risk area(s) flagged`)

// --- Phase 2/3: Review (parallel lenses) -> Verify (parallel per finding), pipelined per lens ---
const LENSES = [
  { key: 'correctness', agentType: 'code-review-correctness-lens' },
  { key: 'security', agentType: 'code-review-security-lens' },
  { key: 'performance', agentType: 'code-review-performance-lens' },
  { key: 'tests', agentType: 'code-review-tests-lens' },
  { key: 'readability', agentType: 'code-review-readability-lens' },
]

function reviewPrompt(lens) {
  return `Review this diff through the ${lens.key} lens only. Be adversarial - report only real, concrete issues.\n\nScope brief:\n${JSON.stringify(scope, null, 2)}\n\nDiff:\n${diff}`
}

// Payload first, task last: the diff is the largest block in this prompt, and the
// instruction lands better at the end than buried above it.
function verifyPrompt(finding, lensKey) {
  return `<diff>\n${diff}\n</diff>\n\n<finding lens="${lensKey}">\n${JSON.stringify(finding, null, 2)}\n</finding>\n\n` +
    `Try to refute the finding above by re-checking it against the actual diff. Default to rejected if you cannot confirm it from the real code. Report what you checked and what it showed, in a few sentences.`
}

const verifiedByLens = await pipeline(
  LENSES,
  lens => agent(reviewPrompt(lens), { agentType: lens.agentType, label: `review:${lens.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  (review, lens) => {
    if (!review || !review.findings || review.findings.length === 0) return []
    return parallel(review.findings.map(f => () =>
      agent(verifyPrompt(f, lens.key), { agentType: 'code-review-verifier', label: `verify:${lens.key}:${f.title}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'opus', effort: 'xhigh' })
        .then(v => ({ ...f, lens: lens.key, verdict: v }))
    ))
  }
)

const allFindings = verifiedByLens.flat().filter(Boolean)
const confirmed = allFindings.filter(f => f.verdict && f.verdict.verdict === 'confirmed')
log(`${confirmed.length}/${allFindings.length} findings survived adversarial verification`)

// --- Phase 4: Report (single agent, sequential) ---
phase('Report')
const report = await agent(
  `Synthesize these verified code review findings into one ranked report. If the list is empty, say so plainly.\n\nVerified findings:\n${JSON.stringify(confirmed, null, 2)}`,
  { agentType: 'code-review-reporter' }
)

return { scope, allFindings, confirmed, report }

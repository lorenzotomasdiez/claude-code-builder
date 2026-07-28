export const meta = {
  name: 'security-audit',
  description: 'Authorized OWASP plus AI/LLM security audit of a diff or service: injection, authn/authz, secrets/crypto, supply-chain/infra, and AI/LLM lenses run in parallel, findings adversarially verified, then ranked into one report',
  phases: [
    { title: 'Scope', detail: 'map entry points, trust boundaries, and data sensitivity for the lenses' },
    { title: 'Audit', detail: 'parallel fan-out: injection, authn/authz, secrets/crypto, supply-chain/infra, AI/LLM lenses' },
    { title: 'Verify', detail: 'adversarially verify each finding to kill false positives (opus: judgment-heavy)' },
    { title: 'Report', detail: 'rank surviving findings by severity into one security report' },
  ],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    entryPoints: {
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
    trustBoundaries: { type: 'array', items: { type: 'string' } },
    dataSensitivity: { type: 'array', items: { type: 'string' } },
    existingControls: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: ['entryPoints'],
}

const FINDING = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'number' },
    severity: {
      type: 'string',
      enum: ['critical', 'high', 'medium', 'low'],
      description: 'critical: exploitable without authentication or gives cross-tenant/cross-user data access. high: exploitable by an authenticated user beyond their own data/permissions. medium: requires an unlikely precondition or leaks low-sensitivity data. low: defense-in-depth or hardening, not an exploitable path today.',
    },
    owaspCategory: { type: 'string' },
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
    verdict: {
      type: 'string',
      enum: ['confirmed', 'rejected'],
      description: 'confirmed: you traced an actual exploit path through the real code with a concrete input/request that triggers it. rejected: an existing control (auth check, validation, sanitization) already blocks it, the path is unreachable, or the finding is speculative with no concrete trigger.',
    },
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

const target = typeof input === 'string' ? input : input && input.target
if (!target) {
  throw new Error(
    'Missing the target to audit. Call this workflow with args set to either a plain string ' +
    '(a diff or a description of the service/surface to audit) or an object shaped ' +
    '{ "target": "...", "context": "optional authorization/scope note" }.'
  )
}
const context = (input && typeof input === 'object' && input.context) || ''

// --- Phase 1: Scope (single agent, sequential) ---
phase('Scope')
const scope = await agent(
  `Map the attack surface for this authorized security audit. Context: ${context || 'none supplied'}.\n\nTarget:\n${target}`,
  { agentType: 'security-audit-scoper', schema: SCOPE_SCHEMA, effort: 'low' }
)
log(`Scope ready: ${scope.entryPoints.length} entry point(s), ${(scope.trustBoundaries || []).length} trust boundary note(s)`)

// --- Phase 2/3: Audit (parallel lenses) -> Verify (parallel per finding), pipelined per lens ---
const LENSES = [
  { key: 'injection', agentType: 'security-audit-injection-lens' },
  { key: 'authn', agentType: 'security-audit-authn-lens' },
  { key: 'secrets', agentType: 'security-audit-secrets-lens' },
  { key: 'supplychain', agentType: 'security-audit-supplychain-lens' },
  { key: 'ai_llm', agentType: 'security-audit-ai-llm-lens' },
]

// Payload first, task last: the scope brief and target are identical across all 5 parallel
// lens calls, so keeping them as a shared prefix (with only the lens name varying at the
// end) is also what a cache-hit needs - a variable token placed before a shared payload
// breaks the prefix match for every call in the fan-out (see PROMPT_CACHE_ORDERING.md).
function auditPrompt(lens) {
  return `<scope>\n${JSON.stringify(scope, null, 2)}\n</scope>\n\n<target>\n${target}\n</target>\n\n` +
    `Audit the target above through the ${lens.key} lens only. This is an authorized defensive security audit - be adversarial, but report only real, concrete, reachable issues.`
}

// Payload first, task last: the target is the largest block in this prompt, and the
// instruction lands better at the end than buried above it.
function verifyPrompt(finding, lensKey) {
  return `<target>\n${target}\n</target>\n\n<finding lens="${lensKey}">\n${JSON.stringify(finding, null, 2)}\n</finding>\n\n` +
    `Try to refute the finding above by re-checking it against the actual target. Default to rejected if you cannot confirm it from the real code. Report what you checked and what it showed, in a few sentences.`
}

const verifiedByLens = await pipeline(
  LENSES,
  lens => agent(auditPrompt(lens), { agentType: lens.agentType, label: `audit:${lens.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA }),
  (review, lens) => {
    if (!review || !review.findings || review.findings.length === 0) return []
    return parallel(review.findings.map(f => () =>
      agent(verifyPrompt(f, lens.key), { agentType: 'security-audit-verifier', label: `verify:${lens.key}:${f.title}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'opus', effort: 'xhigh' })
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
  `Synthesize these verified security audit findings into one ranked report with remediation guidance. If the list is empty, say so plainly.\n\nVerified findings:\n${JSON.stringify(confirmed, null, 2)}`,
  { agentType: 'security-audit-reporter' }
)

return { scope, allFindings, confirmed, report }

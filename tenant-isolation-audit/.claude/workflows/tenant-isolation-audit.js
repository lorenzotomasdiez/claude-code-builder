export const meta = {
  name: 'tenant-isolation-audit',
  description: 'Authorized multi-tenant isolation audit of a diff or service: data-layer, authz/session, background-jobs, and integrations/AI-context lenses run in parallel, findings adversarially verified, then ranked into one report',
  phases: [
    { title: 'Scope', detail: 'map tenancy model, tenant-context carriers, and boundary-crossing entry points' },
    { title: 'Audit', detail: 'parallel fan-out: data-layer, authz/session, background-jobs, integrations/AI-context lenses' },
    { title: 'Verify', detail: 'adversarially verify each finding to kill false positives (opus: judgment-heavy)' },
    { title: 'Report', detail: 'rank surviving findings by severity into one tenant-isolation report' },
  ],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    tenancyModel: { type: 'string', enum: ['shared-schema', 'schema-per-tenant', 'database-per-tenant', 'unclear'] },
    tenantContextCarriers: { type: 'array', items: { type: 'string' } },
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
    existingControls: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: ['tenancyModel', 'entryPoints'],
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

const target = typeof input === 'string' ? input : input && input.target
if (!target) {
  throw new Error(
    'Missing the target to audit. Call this workflow with args set to either a plain string ' +
    '(a diff or a description of the multi-tenant service/surface to audit) or an object shaped ' +
    '{ "target": "...", "context": "optional authorization/scope note" }.'
  )
}
const context = (input && typeof input === 'object' && input.context) || ''

// --- Phase 1: Scope (single agent, sequential) ---
phase('Scope')
const scope = await agent(
  `Map the tenancy model and boundary-crossing entry points for this authorized tenant-isolation audit. Context: ${context || 'none supplied'}.\n\nTarget:\n${target}`,
  { agentType: 'tenant-isolation-audit-scoper', schema: SCOPE_SCHEMA }
)
log(`Scope ready: tenancy model ${scope.tenancyModel}, ${scope.entryPoints.length} entry point(s)`)

// --- Phase 2/3: Audit (parallel lenses) -> Verify (parallel per finding), pipelined per lens ---
const LENSES = [
  { key: 'data', agentType: 'tenant-isolation-audit-data-lens' },
  { key: 'authz', agentType: 'tenant-isolation-audit-authz-lens' },
  { key: 'jobs', agentType: 'tenant-isolation-audit-jobs-lens' },
  { key: 'integrations', agentType: 'tenant-isolation-audit-integration-lens' },
]

// Payload first, task last: the scope brief and target are identical across all 4 parallel
// lens calls, so keeping them as a shared prefix (with only the lens name varying at the
// end) is also what a cache-hit needs - a variable token placed before a shared payload
// breaks the prefix match for every call in the fan-out (see PROMPT_CACHE_ORDERING.md).
function auditPrompt(lens) {
  return `<scope>\n${JSON.stringify(scope, null, 2)}\n</scope>\n\n<target>\n${target}\n</target>\n\n` +
    `Audit the target above through the ${lens.key} lens only. This is an authorized defensive isolation audit - be adversarial, but report only real, concrete, reachable cross-tenant issues.`
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
      agent(verifyPrompt(f, lens.key), { agentType: 'tenant-isolation-audit-verifier', label: `verify:${lens.key}:${f.title}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'opus' })
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
  `Synthesize these verified tenant-isolation audit findings into one ranked report with remediation guidance. Tenancy model: ${scope.tenancyModel}. If the list is empty, say so plainly.\n\nVerified findings:\n${JSON.stringify(confirmed, null, 2)}`,
  { agentType: 'tenant-isolation-audit-reporter' }
)

return { scope, allFindings, confirmed, report }

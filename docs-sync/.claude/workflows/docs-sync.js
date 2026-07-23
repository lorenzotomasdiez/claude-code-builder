export const meta = {
  name: 'docs-sync',
  description: 'Detect drift between code and its docs/README/ADRs, propose targeted grounded updates, and adversarially re-verify each proposal before it ships',
  phases: [
    { title: 'Map', detail: 'inventory doc surfaces (READMEs, docs/, ADRs) and the code areas they describe' },
    { title: 'Detect', detail: 'per-doc: extract verifiable claims and check them against the actual code' },
    { title: 'Propose', detail: 'per doc with confirmed drift: write a targeted, minimal correction' },
    { title: 'Verify', detail: 'per proposal: adversarially re-check grounding, revise if not grounded, capped rounds' },
  ],
}

const MAP_SCHEMA = {
  type: 'object',
  properties: {
    codeStructureSummary: { type: 'string' },
    docs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          describedAreas: { type: 'array', items: { type: 'string' } },
          claimKinds: { type: 'array', items: { type: 'string' } },
        },
        required: ['file'],
      },
    },
  },
  required: ['docs'],
}

const DRIFT_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    hasDrift: { type: 'boolean' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          location: { type: 'string' },
          kind: { type: 'string', enum: ['stale', 'missing', 'contradicted', 'broken-reference'] },
          evidence: { type: 'string' },
        },
        required: ['claim', 'kind', 'evidence'],
      },
    },
  },
  required: ['file', 'hasDrift', 'items'],
}

const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    snippets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          oldText: { type: 'string' },
          newText: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['oldText', 'newText', 'evidence'],
      },
    },
  },
  required: ['file', 'snippets'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    verdict: { type: 'string', enum: ['grounded', 'needs_revision'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['file', 'verdict', 'issues'],
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

const scope = (typeof input === 'string' && input) || (input && typeof input === 'object' && input.scope) || 'the entire repository'
const MAX_ROUNDS = 2

// --- Phase 1: Map (single agent, sequential) ---
phase('Map')
const map = await agent(
  `Inventory the documentation surfaces and what they claim to describe, scoped to: ${scope}. If this scope names a specific path, focus there; otherwise cover the whole repo.`,
  { agentType: 'docs-sync-mapper', schema: MAP_SCHEMA }
)
log(`Found ${map.docs.length} doc(s) to check`)

if (map.docs.length === 0) {
  log('No hand-written docs found in scope - nothing to check')
  return { scope, map, results: [] }
}

// --- Phase 2-4: per doc, independently pipelined (Detect -> Propose -> Verify/Revise) ---
function detectPrompt(doc) {
  return `Check this doc for drift against the current code.\n\nDoc: ${doc.file}\nDescribed area(s): ${(doc.describedAreas || []).join('; ') || 'unspecified'}\nClaim kinds to expect: ${(doc.claimKinds || []).join('; ') || 'unspecified'}\nRepo code-structure summary: ${map.codeStructureSummary || 'none supplied'}`
}

function proposePrompt(doc, drift) {
  return `Write a targeted update for this doc addressing only these confirmed drift items. Read the doc yourself first.\n\nDoc: ${doc.file}\n\nDrift items:\n${JSON.stringify(drift.items, null, 2)}`
}

function verifyPrompt(doc, proposal) {
  return `Adversarially re-verify this proposed doc update against the actual repository before it ships.\n\nDoc: ${doc.file}\n\nProposal:\n${JSON.stringify(proposal, null, 2)}`
}

function revisePrompt(doc, proposal, critique) {
  return `Revise this proposal to address the critic's issues. Only touch what was flagged - keep every snippet the critic did not object to.\n\nDoc: ${doc.file}\n\nCurrent proposal:\n${JSON.stringify(proposal, null, 2)}\n\nCritic issues:\n${JSON.stringify(critique.issues, null, 2)}`
}

const results = await pipeline(
  map.docs,
  doc => agent(detectPrompt(doc), { agentType: 'docs-sync-drift-detector', label: `detect:${doc.file}`, phase: 'Detect', schema: DRIFT_SCHEMA }),
  async (drift, doc) => {
    if (!drift || !drift.hasDrift || drift.items.length === 0) {
      return { file: doc.file, hasDrift: false, drift, proposal: null, verdict: null, rounds: 0 }
    }

    let proposal = await agent(proposePrompt(doc, drift), { agentType: 'docs-sync-writer', label: `propose:${doc.file}`, phase: 'Propose', schema: PROPOSAL_SCHEMA })

    let round = 0
    let critique = null
    while (round < MAX_ROUNDS) {
      critique = await agent(verifyPrompt(doc, proposal), { agentType: 'docs-sync-critic', label: `verify:${doc.file}`, phase: 'Verify', schema: VERDICT_SCHEMA })
      if (critique.verdict === 'grounded') break

      round++
      if (round >= MAX_ROUNDS) {
        log(`${doc.file}: round cap (${MAX_ROUNDS}) reached, ${critique.issues.length} issue(s) still open`)
        break
      }
      proposal = await agent(revisePrompt(doc, proposal, critique), { agentType: 'docs-sync-writer', label: `revise:${doc.file}`, phase: 'Verify', schema: PROPOSAL_SCHEMA })
    }

    return { file: doc.file, hasDrift: true, drift, proposal, verdict: critique, rounds: round }
  }
)

const withDrift = results.filter(Boolean).filter(r => r.hasDrift)
log(`${withDrift.length}/${results.length} doc(s) had confirmed drift`)

return { scope, map, results: results.filter(Boolean) }

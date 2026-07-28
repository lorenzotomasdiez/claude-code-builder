export const meta = {
  name: 'prd-generator-v2',
  description: 'Generate a Perfect-PRD-standard PRD from a raw idea via clarify -> research -> draft -> critique -> revise, with size-bounded structured output and a draft written to disk once and referenced by path instead of re-embedded in every prompt',
  phases: [
    { title: 'Clarify', detail: 'turn the raw idea into a structured, sized brief' },
    { title: 'Research', detail: 'parallel fan-out: market, technical, ux lenses' },
    { title: 'Draft', detail: 'write the first PRD draft to disk against the house structure' },
    { title: 'Size check', detail: 'trim once if the draft exceeds its sizing tier ceiling' },
    { title: 'Critique', detail: 'parallel adversarial review against the Quality Checklist, reading the draft from disk (feasibility, completeness, business-value; opus: judgment-heavy)' },
    { title: 'Revise', detail: 'incorporate critique, re-review, repeat until clean or capped' },
  ],
}

// Bounding string/array lengths in the schemas below is the validator this workflow
// asks for: an agent whose structured output would blow past these caps fails schema
// validation and is forced to retry with a tighter answer, instead of us discovering
// the bloat only after it lands in the transcript.
const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    problem: { type: 'string', maxLength: 600 },
    evidence: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 300 } },
    currentStateAndWorkarounds: { type: 'string', maxLength: 800 },
    strategicFit: { type: 'string', maxLength: 400 },
    whyNow: { type: 'string', maxLength: 400 },
    costOfInaction: { type: 'string', maxLength: 400 },
    goals: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 200 } },
    primaryMetricHypothesis: { type: 'string', maxLength: 300 },
    targetUsers: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 200 } },
    antiPersona: { type: 'string', maxLength: 300 },
    nonGoals: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 200 } },
    constraints: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 200 } },
    productType: { type: 'string', maxLength: 40 },
    sizing: { type: 'string', enum: ['small', 'medium', 'large'] },
    openQuestions: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 300 } },
  },
  required: ['problem', 'goals', 'targetUsers', 'sizing'],
}

// Caps here are deliberately more generous than BRIEF_SCHEMA/CRITIQUE_SCHEMA: a first
// real run showed the technical lens exhausting the StructuredOutput retry cap (5 failed
// calls, ~20K tokens burned, lens dropped entirely) against the original, tighter caps -
// a real technical-feasibility investigation has more to say than a brief or a critique
// issue list, and losing the whole lens to retry thrash is worse than a larger field.
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 600 } },
    risks: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 500 } },
    dependencies: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 400 } },
  },
  required: ['lens', 'findings'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['ready', 'needs_revision'] },
    issues: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 400 } },
  },
  required: ['lens', 'verdict', 'issues'],
}

// The prd-writer agent always writes the PRD to disk itself and reports back only
// this - never the document text - so the draft is never re-embedded into downstream
// prompts. Critics and revise passes are given the path and read it themselves.
const DRAFT_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    charCount: { type: 'number' },
    version: { type: 'string' },
  },
  required: ['path', 'charCount', 'version'],
}

// Generous ceilings per sizing tier (chars). These are guardrails against runaway
// drafts, not hard word-count targets - the writer agent's own sizing rules already
// aim well under these.
const SIZE_CEILINGS = { small: 4000, medium: 16000, large: 32000 }

function slugify(idea) {
  const slug = idea
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'untitled'
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

const idea = typeof input === 'string' ? input : input && input.idea
if (!idea) {
  throw new Error(
    'Missing the product idea. Call this workflow with args set to either a plain string ' +
    '(the idea itself) or an object shaped { "idea": "...", "date": "YYYY-MM-DD" }.'
  )
}
const date = (input && typeof input === 'object' && input.date) || 'unknown - fill in before this leaves Draft'
const prdPath = `docs/product-specs/${slugify(idea)}-prd.md`

// --- Phase 1: Clarify (single agent, sequential) ---
phase('Clarify')
const brief = await agent(
  `Turn this raw product idea into a structured brief: "${idea}". If critical details are missing, make explicit, labeled assumptions instead of blocking.`,
  { agentType: 'prd-clarifier', schema: BRIEF_SCHEMA }
)
log(`Brief ready (sizing: ${brief.sizing}): ${brief.problem}`)

// --- Phase 2: Research (parallel fan-out, one agent per lens) ---
phase('Research')
const LENSES = [
  { key: 'market', prompt: `Research the competitive/market landscape for: ${brief.problem}. Goals: ${brief.goals.join('; ')}. Strategic fit as stated in the brief: ${brief.strategicFit || 'not stated'}. Validate or challenge this evidence from the brief with sourced findings: ${(brief.evidence || []).join('; ') || 'none supplied'}` },
  { key: 'technical', prompt: `Assess technical feasibility, non-functional considerations, and dependencies for: ${brief.problem}. Known constraints: ${(brief.constraints || []).join('; ') || 'none stated'}. Product type: ${brief.productType || 'generic'}.` },
  { key: 'ux', prompt: `Research target user needs, UX expectations, and edge cases for: ${brief.problem}. Target users: ${brief.targetUsers.join('; ')}. Anti-persona: ${brief.antiPersona || 'not stated'}.` },
]
const research = (await parallel(LENSES.map(l => () =>
  agent(l.prompt, { agentType: 'prd-researcher', label: `research:${l.key}`, phase: 'Research', schema: FINDINGS_SCHEMA })
))).filter(Boolean)

// --- Phase 3: Draft (single agent, sequential) - writes to disk, returns status only ---
phase('Draft')
let draftStatus = await agent(
  `Write a full PRD in markdown to file ${prdPath} from this brief and research, following the house structure and sizing rules exactly. Sizing tier: ${brief.sizing}. Date to use for "Last updated": ${date}. Version: v0.1.\n\n` +
  `Brief:\n${JSON.stringify(brief, null, 2)}\n\nResearch:\n${JSON.stringify(research, null, 2)}`,
  { agentType: 'prd-writer', schema: DRAFT_STATUS_SCHEMA }
)
log(`Draft written to ${draftStatus.path} (${draftStatus.charCount} chars, ${draftStatus.version})`)

// --- Phase 3b: Size check - trim once if over the sizing tier's ceiling. This runs
// after the initial draft AND after every revise pass below: a first real run showed a
// revise pass alone growing the draft to over 5x its ceiling with nothing catching it,
// because the size check previously ran only once, right after the first draft. ---
const ceiling = SIZE_CEILINGS[brief.sizing] || SIZE_CEILINGS.medium
async function enforceSizeCeiling(status, label) {
  if (status.charCount <= ceiling) return status
  log(`${label}: draft is oversized for a ${brief.sizing} PRD (${status.charCount} chars vs an expected ceiling of ~${ceiling}) - requesting one trim pass`)
  const trimmed = await agent(
    `The PRD you wrote at ${status.path} is too long for a ${brief.sizing}-sized PRD (~${status.charCount} chars vs an expected ceiling of ~${ceiling}). ` +
    `Read it, trim it per your sizing-tier rules without dropping requirements, risks, or open questions, bump the version, and overwrite the file at the same path.`,
    { agentType: 'prd-writer', schema: DRAFT_STATUS_SCHEMA }
  )
  if (trimmed.charCount > ceiling) {
    log(`${label}: still oversized after one trim pass (${trimmed.charCount} chars) - proceeding anyway, capped at one trim attempt`)
  } else {
    log(`${label}: trimmed to ${trimmed.charCount} chars (${trimmed.version})`)
  }
  return trimmed
}

phase('Size check')
draftStatus = await enforceSizeCeiling(draftStatus, 'Post-draft size check')

// --- Phase 4/5: Critique -> Revise loop (parallel critics read from disk, capped rounds) ---
const CRITIQUE_LENSES = ['feasibility', 'completeness', 'business-value']
const MAX_ROUNDS = 2
let round = 0
let lastNeedsWork = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIQUE_LENSES.map(lens => () =>
    agent(
      `Read the PRD draft at ${draftStatus.path} and critique it through the ${lens} lens only. Be adversarial - look for gaps, unstated assumptions, and unmeasurable goals - and list every checklist item that fails, including the small ones. The verdict rule, not your sense of importance, decides what happens next.`,
      { agentType: 'prd-critic', label: `critique:${lens}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, model: 'opus' }
    )
  ))).filter(Boolean)

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  lastNeedsWork = needsWork
  if (needsWork.length === 0) {
    log('All lenses signed off - PRD is ready')
    break
  }

  round++
  if (round >= MAX_ROUNDS) {
    log(`Round cap (${MAX_ROUNDS}) reached with ${needsWork.length}/${critiques.length} lenses still flagging issues - returning best draft`)
    break
  }

  phase('Revise')
  log(`Revising: ${needsWork.length}/${critiques.length} lenses flagged issues (round ${round})`)
  draftStatus = await agent(
    `Read the current PRD draft at ${draftStatus.path} and revise it to address the following critique. Keep everything that already works and was not flagged. Bump the version and overwrite the file at the same path.\n\n` +
    `Critique:\n${JSON.stringify(needsWork, null, 2)}`,
    { agentType: 'prd-writer', schema: DRAFT_STATUS_SCHEMA }
  )

  phase('Size check')
  draftStatus = await enforceSizeCeiling(draftStatus, `Post-revise size check (round ${round})`)
}

// Return a summary-shaped result, not the full brief/research/critique/draft blob:
// the draft already lives on disk at draftStatus.path, so there is nothing to gain
// from re-embedding it (or the full research) into the workflow's own return value -
// that was the exact payload that got truncated and forced ad hoc file-parsing in
// the real run this fix is based on (see reports/context-bloat-forensics/).
// Cap openIssues rather than concatenating every lens's every issue: with up to 3 lenses
// x 20 issues x 400+ chars each, this list alone could rival the size of the draft it
// describes and risks the same truncation-on-read problem this workflow's return shape
// was already redesigned to avoid.
const MAX_OPEN_ISSUES = 15
const allOpenIssues = lastNeedsWork.flatMap(c => c.issues.map(issue => `[${c.lens}] ${issue}`))
const openIssues = allOpenIssues.slice(0, MAX_OPEN_ISSUES)
if (allOpenIssues.length > MAX_OPEN_ISSUES) {
  log(`${allOpenIssues.length} open issues found across all lenses - returning the first ${MAX_OPEN_ISSUES}; see ${draftStatus.path}'s critique history for the rest`)
}

return {
  brief: { problem: brief.problem, sizing: brief.sizing, goals: brief.goals },
  roundsRun: round,
  openIssues,
  openIssuesTotal: allOpenIssues.length,
  prdPath: draftStatus.path,
  prdVersion: draftStatus.version,
}

export const meta = {
  name: 'architecture-designer',
  description: 'Produce an architecture document set (characteristics, component design, ADRs, tech-stack decisions) FOR AN EXISTING PRD via clarify -> draft -> critique -> revise. Not autonomous: requires a real PRD to design against, writes its own file, and extends the PRD with a minimal back-reference instead of an unbounded rewrite.',
  phases: [
    { title: 'Clarify', detail: 'read the existing PRD and turn it into a structured architecture brief (opus: architecture-level judgment)' },
    { title: 'Draft', detail: 'write the document set to disk and link back from the PRD with one minimal edit (opus: architecture-level judgment)' },
    { title: 'Size check', detail: 'trim once if the draft exceeds its size ceiling - reapplied after every revise, not just the first draft' },
    { title: 'Critique', detail: 'parallel adversarial review, reading the draft from disk: trade-off-rigor, adr-quality, operability (opus: architecture-level judgment)' },
    { title: 'Revise', detail: 'incorporate critique, re-check size, re-review, repeat until clean or capped (opus: architecture-level judgment)' },
  ],
}

// Bounding string/array lengths is the validator this workflow asks for: an agent whose
// structured output would blow past these caps fails schema validation and is forced to
// retry with a tighter answer. Caps here are deliberately generous (learned from a real
// run of the sibling prd-generator-v2 workflow, where tighter caps on a research-style
// lens exhausted the retry cap and dropped that lens entirely) rather than the tightest
// bound that would technically fit a typical answer.
const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    prdFound: { type: 'boolean' },
    problem: { type: 'string', maxLength: 700 },
    scopeBoundary: { type: 'string', maxLength: 500 },
    drivingCharacteristics: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 60 },
          rationale: { type: 'string', maxLength: 350 },
        },
        required: ['name', 'rationale'],
      },
    },
    constraints: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 300 } },
    scaleExpectations: { type: 'string', maxLength: 300 },
    existingLandscape: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 300 } },
    // Hub-and-spoke handoff from tech-stack-selector: if the PRD links a tech-stack document
    // (its header Links row references one), the clarifier reads it and pulls the already-
    // decided choices in here so architecture-writer cites them in Section 5 instead of
    // re-deriving a tech stack from its own head. Empty when no such document is linked.
    techStackDecisions: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          area: { type: 'string', maxLength: 60 },
          choice: { type: 'string', maxLength: 150 },
          reversibility: { type: 'string', maxLength: 20 },
        },
        required: ['area', 'choice'],
      },
    },
    openQuestions: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 300 } },
  },
  required: ['prdFound', 'problem', 'drivingCharacteristics'],
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

// The architecture-writer agent always writes the document to disk itself and reports
// back only this - never the document text - so it is never re-embedded into downstream
// prompts. Critics and revise passes are given the path and read it themselves.
// prdLinked is only meaningful on the first-pass Draft call.
const DRAFT_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    charCount: { type: 'number' },
    version: { type: 'string' },
    prdLinked: { type: 'boolean' },
  },
  required: ['path', 'charCount', 'version'],
}

// A generous ceiling (chars) against runaway drafts, not a word-count target. Architecture
// documents run larger than PRDs for the same scope - a real smoke-test run of a
// non-trivial system (multiple ADRs, a characteristics scorecard, CAP-position tables)
// landed at 33,110 chars pre-trim, and the original 18,000 ceiling left the one-trim-attempt
// cap exhausted at both check points. Raised based on that evidence rather than left tight.
const SIZE_CEILING = 30000

// Sibling file next to the PRD: docs/product-specs/foo-prd.md -> docs/product-specs/foo-architecture.md;
// docs/product-specs/foo/prd.md -> docs/product-specs/foo/architecture.md.
function architecturePathFor(prdPath) {
  const lastSlash = prdPath.lastIndexOf('/')
  const dir = lastSlash === -1 ? '' : prdPath.slice(0, lastSlash + 1)
  const base = lastSlash === -1 ? prdPath : prdPath.slice(lastSlash + 1)
  const stem = base.replace(/\.md$/i, '').replace(/-?prd$/i, '')
  return `${dir}${stem ? stem + '-' : ''}architecture.md`
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

const prdPath = typeof input === 'string' ? input : input && input.prdPath
if (!prdPath) {
  throw new Error(
    'Missing prdPath. This workflow designs architecture FOR an existing PRD - it does not work autonomously ' +
    'from a raw idea. Call it with args shaped { "prdPath": "docs/product-specs/<slug>-prd.md", "date": "YYYY-MM-DD", ' +
    '"focus": "optional: which part of the PRD to focus on" }.'
  )
}
const date = (input && typeof input === 'object' && input.date) || 'unknown - fill in before this leaves Draft'
const focus = (input && typeof input === 'object' && input.focus) || ''
const architecturePath = architecturePathFor(prdPath)

// --- Phase 1: Clarify (single agent, sequential) - reads the PRD, does not invent one ---
phase('Clarify')
const brief = await agent(
  `Read the existing PRD at ${prdPath} and turn it into a structured architecture brief.` +
  (focus ? ` Focus specifically on: ${focus}.` : '') +
  ` If the PRD cannot be found or read, do not invent one - report prdFound: false instead.`,
  { agentType: 'architecture-clarifier', schema: BRIEF_SCHEMA, model: 'opus' }
)
if (!brief.prdFound) {
  throw new Error(
    `Could not read a PRD at ${prdPath}. architecture-designer designs FOR an existing PRD and does not work ` +
    `autonomously from a raw idea - generate a PRD first (e.g. with prd-generator-v2), then run this workflow against it.`
  )
}
const techStackDecisions = brief.techStackDecisions || []
log(`Brief ready. Top characteristic: ${brief.drivingCharacteristics[0]?.name}` +
  (techStackDecisions.length ? `. Found a linked tech-stack handoff: ${techStackDecisions.length} decision(s) already made.` : '. No linked tech-stack document found - Section 5 will be the writer\'s own call.'))

// --- Phase 2: Draft (single agent, sequential) - writes to disk, links back from the PRD ---
phase('Draft')
let draftStatus = await agent(
  `Write the full architecture document set to file ${architecturePath} from this brief, following the house structure exactly. Date to use for "Last updated": ${date}. Version: v0.1. Design what the brief asks for at the scope it states.\n\n` +
  `Brief:\n${JSON.stringify(brief, null, 2)}\n\n` +
  `Then link back from the PRD: read ${prdPath}, find its header "Links" row, and replace its "Tech design" placeholder with a real reference to ${architecturePath} (a relative link if they share a directory). This must be a minimal, targeted edit - do not touch anything else in the PRD. Set prdLinked to whether this succeeded.`,
  { agentType: 'architecture-writer', model: 'opus', schema: DRAFT_STATUS_SCHEMA }
)
const prdLinked = draftStatus.prdLinked === true
log(`Architecture doc written to ${draftStatus.path} (${draftStatus.charCount} chars, ${draftStatus.version}) - PRD linked: ${prdLinked}`)

// --- Phase 2b: Size check - trim once if over the ceiling. Reapplied after every revise
// below, not just the first draft: a real run of the sibling prd-generator-v2 workflow
// showed a revise pass alone growing a draft to over 5x its ceiling when the size check
// only ran once, right after the first draft. ---
async function enforceSizeCeiling(status, label) {
  if (status.charCount <= SIZE_CEILING) return status
  log(`${label}: draft is oversized (${status.charCount} chars vs an expected ceiling of ~${SIZE_CEILING}) - requesting one trim pass`)
  const trimmed = await agent(
    `The architecture document you wrote at ${status.path} is too long (~${status.charCount} chars vs an expected ceiling of ~${SIZE_CEILING}). ` +
    `Read it, tighten prose density before ever cutting a scorecard row, ADR, or risk, bump the version, and overwrite the file at the same path.`,
    { agentType: 'architecture-writer', model: 'opus', schema: DRAFT_STATUS_SCHEMA }
  )
  if (trimmed.charCount > SIZE_CEILING) {
    log(`${label}: still oversized after one trim pass (${trimmed.charCount} chars) - proceeding anyway, capped at one trim attempt`)
  } else {
    log(`${label}: trimmed to ${trimmed.charCount} chars (${trimmed.version})`)
  }
  return trimmed
}

phase('Size check')
draftStatus = await enforceSizeCeiling(draftStatus, 'Post-draft size check')

// --- Phase 3/4: Critique -> Revise loop (parallel critics read from disk, capped rounds) ---
const CRITIQUE_LENSES = ['trade-off-rigor', 'adr-quality', 'operability']
const MAX_ROUNDS = 2
let round = 0
let lastNeedsWork = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIQUE_LENSES.map(lens => () =>
    agent(
      `Read the architecture document draft at ${draftStatus.path} and critique it through the ${lens} lens only. Be adversarial - look for hidden trade-offs, weak ADRs, and unoperable designs - and list every checklist item that fails, including the small ones. The verdict rule, not your sense of importance, decides what happens next.`,
      { agentType: 'architecture-critic', label: `critique:${lens}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, model: 'opus' }
    )
  ))).filter(Boolean)

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  lastNeedsWork = needsWork
  if (needsWork.length === 0) {
    log('All lenses signed off - architecture design is ready')
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
    `Read the current architecture draft at ${draftStatus.path} and revise it to address the following critique. Keep everything that already works and was not flagged, and change nothing the critique did not raise. Bump the version and overwrite the file at the same path. Do not touch the PRD again - it was already linked on the first pass.\n\n` +
    `Critique:\n${JSON.stringify(needsWork, null, 2)}`,
    { agentType: 'architecture-writer', model: 'opus', schema: DRAFT_STATUS_SCHEMA }
  )

  phase('Size check')
  draftStatus = await enforceSizeCeiling(draftStatus, `Post-revise size check (round ${round})`)
}

// Cap openIssues rather than concatenating every lens's every issue across every round -
// see prd-generator-v2's changelog for why (a real run's uncapped equivalent hit 32.7KB
// and got truncated on read).
const MAX_OPEN_ISSUES = 15
const allOpenIssues = lastNeedsWork.flatMap(c => c.issues.map(issue => `[${c.lens}] ${issue}`))
const openIssues = allOpenIssues.slice(0, MAX_OPEN_ISSUES)
if (allOpenIssues.length > MAX_OPEN_ISSUES) {
  log(`${allOpenIssues.length} open issues found across all lenses - returning the first ${MAX_OPEN_ISSUES}; see ${draftStatus.path}'s critique history for the rest`)
}

// Return a summary-shaped result, not the full brief/critique/document blob: the document
// already lives on disk at draftStatus.path, and the PRD already links to it.
return {
  brief: { problem: brief.problem, topCharacteristics: brief.drivingCharacteristics.map(c => c.name) },
  techStackDecisionsUsed: techStackDecisions.length,
  roundsRun: round,
  openIssues,
  openIssuesTotal: allOpenIssues.length,
  architecturePath: draftStatus.path,
  architectureVersion: draftStatus.version,
  prdPath,
  prdLinked,
}

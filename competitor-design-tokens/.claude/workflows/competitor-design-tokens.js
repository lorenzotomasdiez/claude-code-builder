export const meta = {
  name: 'competitor-design-tokens',
  description: 'Find real competitor landing pages for a product/niche, extract REAL styling evidence from each (live CSS custom properties where available, computed styles sampled via playwright-cli otherwise, plus a screenshot), pick the single best-in-class reference, and author a design-tokens.md for the caller\'s own product grounded in that evidence',
  phases: [
    { title: 'Scout', detail: 'find real, verified competitor/comparable landing pages, biased toward strong design craft' },
    { title: 'Capture', detail: 'one agent per competitor, in parallel: screenshot + extract real CSS custom properties and/or computed styles' },
    { title: 'Judge', detail: 'pick the single best-in-class competitor to base the token system on, with a grounded rationale' },
    { title: 'Author tokens', detail: 'write design-tokens.md for the caller\'s own product, every primitive traced to the winner\'s real evidence' },
  ],
}

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    productContext: { type: 'string' },
    competitors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
          whyRelevant: { type: 'string' },
        },
        required: ['name', 'url'],
      },
    },
  },
  required: ['competitors'],
}

const CAPTURE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    url: { type: 'string' },
    status: { type: 'string', enum: ['pass', 'blocked'] },
    screenshots: {
      type: 'object',
      properties: {
        nav: { type: 'string' },
        hero: { type: 'string' },
        cta: { type: 'string' },
        card: { type: 'string' },
        footer: { type: 'string' },
      },
    },
    rawTokens: {
      type: 'object',
      properties: {
        sourceCssFound: { type: 'boolean' },
        colors: {
          type: 'array',
          items: {
            type: 'object',
            properties: { role: { type: 'string' }, hex: { type: 'string' } },
            required: ['role', 'hex'],
          },
        },
        fontFamilies: { type: 'array', items: { type: 'string' } },
        fontSizes: {
          type: 'object',
          properties: { h1: { type: 'string' }, body: { type: 'string' } },
        },
        ctaRadius: { type: 'string' },
        ctaBackground: { type: 'string' },
        shadow: { type: 'string' },
        rootCustomProperties: { type: 'array', items: { type: 'string' } },
      },
    },
    notes: { type: 'string' },
  },
  required: ['name', 'url', 'status'],
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    winner: {
      type: 'object',
      properties: { name: { type: 'string' }, url: { type: 'string' } },
      required: ['name', 'url'],
    },
    rationale: { type: 'string' },
    runnersUp: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, whyNotChosen: { type: 'string' } },
      },
    },
    borrowedElements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fromCompetitor: { type: 'string' },
          element: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
  },
  required: ['winner', 'rationale'],
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
    'Missing the research target. Call this workflow with args set to either a plain string ' +
    '(a description of your own product/niche, e.g. "our AI note-taking app") or an object shaped ' +
    '{ "target": "...", "runId": "<timestamp>", "context": "optional", "competitors": [{ "name": "...", "url": "..." }] }.\n' +
    'Pass `competitors` explicitly to skip the Scout phase when you already know who to study.'
  )
}
// The command supplies runId - workflow scripts cannot generate timestamps themselves.
const runId = (input && typeof input === 'object' && input.runId) || 'run'
const context = (input && typeof input === 'object' && input.context) || ''
const suppliedCompetitors = (input && typeof input === 'object' && Array.isArray(input.competitors) && input.competitors.length)
  ? input.competitors
  : null
const runDir = `design-research/competitor-design-tokens-${runId}`

// --- Phase 1: Scout (skipped if the caller already supplied a competitor list) ---
let competitors
let productContext = target
if (suppliedCompetitors) {
  competitors = suppliedCompetitors
  log(`Using ${competitors.length} caller-supplied competitor(s), skipping Scout`)
} else {
  phase('Scout')
  const scouted = await agent(
    `Find real, currently-live competitor or comparable landing pages worth extracting design tokens from, for: "${target}". Extra context: ${context || 'none'}. Verify each URL actually resolves. Bias toward strong design craft over pure market share. Aim for 4-6 with variety.`,
    { agentType: 'cdt-scout', schema: SCOUT_SCHEMA }
  )
  competitors = scouted.competitors
  productContext = scouted.productContext || target
  log(`Scout found ${competitors.length} competitor(s) to capture`)
}

if (!competitors.length) {
  throw new Error('No competitors to capture - the Scout found none and none were supplied. Try a broader or more specific target.')
}

// --- Phase 2: Capture (one agent per competitor, in parallel) ---
phase('Capture')
const captures = (await parallel(competitors.map(c => {
  const slug = (c.slug || c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return () => agent(
    `Capture this competitor's landing page: PER-COMPONENT screenshots (nav, hero, cta, card, footer - never a full-page image) into ${runDir}/screenshots/${slug}/, AND real extracted styling evidence per the capturer contract (real CSS custom properties where a linked stylesheet exposes them, computed styles sampled via playwright-cli run-code otherwise). Never report a value you did not actually read.\n\nName: ${c.name}\nURL: ${c.url}\nWhy relevant: ${c.whyRelevant || 'not stated'}`,
    { agentType: 'cdt-capturer', label: `capture:${slug}`, phase: 'Capture', schema: CAPTURE_SCHEMA }
  )
}))).filter(Boolean)
const passed = captures.filter(c => c.status === 'pass').length
log(`Capture: ${passed}/${captures.length} competitors captured`)

const usableCaptures = captures.filter(c => c.status === 'pass')
if (!usableCaptures.length) {
  throw new Error('Every competitor capture was blocked - no real styling evidence to judge or build tokens from. Check that playwright-cli is installed and the competitor sites are reachable.')
}

// --- Phase 3: Judge (pick the single best-in-class reference) ---
phase('Judge')
const judged = await agent(
  `Review every captured competitor's real extracted evidence and pick the ONE best-in-class reference to base a new design-token system on for: ${productContext}\n\nCaptures:\n${JSON.stringify(usableCaptures, null, 2)}`,
  { agentType: 'cdt-judge', schema: JUDGE_SCHEMA }
)
log(`Judge picked: ${judged.winner.name}`)

const winnerCapture = usableCaptures.find(c => c.url === judged.winner.url) || usableCaptures.find(c => c.name === judged.winner.name)

// --- Phase 4: Author tokens ---
phase('Author tokens')
const tokensDoc = await agent(
  `Write design-tokens.md for this product: ${productContext}\n\nBase every primitive on this winning competitor's REAL extracted evidence - do not invent values. Cite what you traced each token to.\n\nJudge's pick and rationale:\n${JSON.stringify(judged, null, 2)}\n\nWinner's raw captured evidence:\n${JSON.stringify(winnerCapture, null, 2)}`,
  { agentType: 'cdt-token-author' }
)

return { productContext, competitors, captures, judged, runDir, tokensDoc }

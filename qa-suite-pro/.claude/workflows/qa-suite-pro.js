export const meta = {
  name: 'qa-suite-pro',
  description: 'Full QA of a service/area: architect a layered code-test strategy AND derive UI user stories, engineer the missing code tests and run them, verify coverage, then drive a real headless browser (playwright-cli) through each UI story with screenshots, and report code + UI results',
  phases: [
    { title: 'Scope', detail: 'normalize the target and locate code, existing tests, docs, the test runner, and how/where the app runs in a browser' },
    { title: 'Strategy', detail: 'qa-architect: inventory existing coverage, build the code-test matrix and gaps, and derive UI user stories for the browser E2E pass' },
    { title: 'Implement', detail: 'qa-engineer: write the missing code tests per the gaps, then run the suite' },
    { title: 'Verify', detail: 'qa-coverage-critic: check delivered code coverage against the strategy; capped loop back to the engineer' },
    { title: 'Author stories', detail: 'write the derived UI stories to YAML in this run\'s timestamped folder' },
    { title: 'Browse', detail: 'drive a headless browser through each UI story in parallel, screenshot every step, capture pass/fail and console errors' },
    { title: 'Report', detail: 'qa-reporter: synthesize the code-test results and the browser E2E results into one report' },
  ],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    target: { type: 'string' },
    codePaths: { type: 'array', items: { type: 'string' } },
    existingTestPaths: { type: 'array', items: { type: 'string' } },
    testRunner: { type: 'string' },
    runCommand: { type: 'string' },
    docPaths: { type: 'array', items: { type: 'string' } },
    hasUi: { type: 'boolean' },
    baseUrl: { type: 'string' },
    startCommand: { type: 'string' },
    existingStoryPaths: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['target', 'testRunner', 'hasUi'],
}

const UI_STORY = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    slug: { type: 'string' },
    url: { type: 'string' },
    priority: { type: 'string', enum: ['high', 'medium', 'low'] },
    workflow: { type: 'string' },
  },
  required: ['name', 'slug', 'url', 'workflow'],
}

const STRATEGY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    testMatrix: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          layer: { type: 'string', enum: ['unit', 'integration', 'e2e', 'contract', 'performance'] },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          rationale: { type: 'string' },
        },
        required: ['area', 'layer', 'priority'],
      },
    },
    existingCoverage: { type: 'array', items: { type: 'string' } },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          layer: { type: 'string', enum: ['unit', 'integration', 'e2e', 'contract', 'performance'] },
          whatToTest: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['area', 'layer', 'whatToTest'],
      },
    },
    uiStories: { type: 'array', items: UI_STORY },
    staleOrRisky: { type: 'array', items: { type: 'string' } },
    docIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'testMatrix', 'gaps', 'uiStories'],
}

const ENGINEER_SCHEMA = {
  type: 'object',
  properties: {
    testsWritten: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, layer: { type: 'string' }, covers: { type: 'string' } },
        required: ['path', 'covers'],
      },
    },
    executed: { type: 'boolean' },
    runCommand: { type: 'string' },
    passed: { type: 'number' },
    failed: { type: 'number' },
    skipped: { type: 'number' },
    failures: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['executed', 'notes'],
}

const COVERAGE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['complete', 'incomplete'] },
    coveredGaps: { type: 'array', items: { type: 'string' } },
    remainingGaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          layer: { type: 'string', enum: ['unit', 'integration', 'e2e', 'contract', 'performance'] },
          whatToTest: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['area', 'layer', 'whatToTest'],
      },
    },
    qualityIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'remainingGaps'],
}

const AUTHOR_SCHEMA = {
  type: 'object',
  properties: {
    storiesFile: { type: 'string' },
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, slug: { type: 'string' }, url: { type: 'string' } },
        required: ['name', 'slug', 'url'],
      },
    },
  },
  required: ['storiesFile', 'stories'],
}

const BROWSER_SCHEMA = {
  type: 'object',
  properties: {
    story: { type: 'string' },
    status: { type: 'string', enum: ['pass', 'fail', 'blocked'] },
    stepsTotal: { type: 'number' },
    stepsPassed: { type: 'number' },
    failedAtStep: { type: 'number' },
    screenshotDir: { type: 'string' },
    failureDetail: { type: 'string' },
    consoleErrors: { type: 'array', items: { type: 'string' } },
  },
  required: ['story', 'status'],
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
    'Missing the QA target. Call this workflow with args set to either a plain string ' +
    '(the service/area to QA) or an object shaped { "target": "...", "runId": "<timestamp>", "baseUrl": "optional", "context": "optional" }.'
  )
}
// The command supplies runId - workflow scripts cannot generate timestamps themselves.
const runId = (input && typeof input === 'object' && input.runId) || 'run'
const baseUrlHint = (input && typeof input === 'object' && input.baseUrl) || ''
const context = (input && typeof input === 'object' && input.context) || ''
const runDir = `qa-runs/qa-suite-pro-${runId}`

// --- Phase 1: Scope ---
phase('Scope')
const scope = await agent(
  `Normalize this QA target and locate what QA needs: "${target}". Extra context: ${context || 'none'}. Base URL hint (may be empty): ${baseUrlHint || 'none'}.\n` +
  `Find the code paths, existing tests, docs, and the test runner + run command. Also determine whether this target has a browser UI, and if so the base URL it serves on and the command to start it, plus any existing UI story YAML files. Map the terrain; do not judge or write anything.`,
  { agentType: 'qa-suite-pro-scoper', schema: SCOPE_SCHEMA }
)
log(`Scope ready: runner ${scope.testRunner}, ${(scope.existingTestPaths || []).length} test file(s), hasUi=${scope.hasUi}${scope.baseUrl ? `, baseUrl ${scope.baseUrl}` : ''}`)

// --- Phase 2: Strategy ---
phase('Strategy')
const strategy = await agent(
  `Design the QA strategy for this target. Inventory what is ALREADY tested (read the existing tests, including any a prior workflow left behind) and check the docs. Then produce: (a) a layered code-test matrix (unit/integration/e2e/contract/performance) and the concrete gaps, and (b) UI user stories to validate in a real browser - one per meaningful user-facing flow, each with a name, a kebab-case slug, a full starting URL (use the base URL ${scope.baseUrl || '(none detected - state the assumed local URL)'}), a priority, and a step-by-step workflow the browser agent can execute (imperative steps with explicit assertions). If the target has no UI, return an empty uiStories list.\n\nScope:\n${JSON.stringify(scope, null, 2)}`,
  { agentType: 'qa-suite-pro-architect', schema: STRATEGY_SCHEMA }
)
log(`Strategy ready: ${strategy.gaps.length} code gap(s), ${strategy.uiStories.length} UI story(ies)`)

// --- Phase 3/4: Implement -> Verify (code tests), capped loop ---
const MAX_ROUNDS = 2
let round = 0
let gapsToAddress = strategy.gaps
let engineering = null
let coverage = null

while (round < MAX_ROUNDS) {
  phase('Implement')
  const gapNote = gapsToAddress.length
    ? `Write the tests for these gaps, matching the repo's runner and conventions:\n${JSON.stringify(gapsToAddress, null, 2)}`
    : `The architect found no code gaps. Do not invent tests - just run the existing suite and report what you find.`
  engineering = await agent(
    `${gapNote}\n\nAfter writing, RUN the suite with the real command (${scope.runCommand || scope.testRunner}) and report actual results - never claim an unobserved pass. Report code defects a test reveals as findings; do not weaken tests or patch the code under test.\n\nScope:\n${JSON.stringify(scope, null, 2)}`,
    { agentType: 'qa-suite-pro-engineer', phase: 'Implement', schema: ENGINEER_SCHEMA }
  )
  log(`Implement round ${round + 1}: ${(engineering.testsWritten || []).length} test file(s), executed=${engineering.executed}`)

  phase('Verify')
  coverage = await agent(
    `Verify whether the delivered tests genuinely cover the proposed matrix. Re-read and, where load-bearing, re-run - do not trust the engineer's summary. A gap is covered only if a real test exercises the behavior. Return the gaps still open.\n\nProposed matrix:\n${JSON.stringify(strategy.testMatrix, null, 2)}\n\nGaps this round targeted:\n${JSON.stringify(gapsToAddress, null, 2)}\n\nEngineer reported:\n${JSON.stringify(engineering, null, 2)}`,
    { agentType: 'qa-suite-pro-coverage-critic', phase: 'Verify', schema: COVERAGE_SCHEMA }
  )
  if (coverage.verdict === 'complete') { log('Code coverage verified complete'); break }
  round++
  if (round >= MAX_ROUNDS) { log(`Round cap reached with ${coverage.remainingGaps.length} code gap(s) open`); break }
  gapsToAddress = coverage.remainingGaps
  log(`Code coverage incomplete: ${coverage.remainingGaps.length} gap(s) remain, looping back (round ${round + 1})`)
}

// --- Phase 5/6: Browser E2E (only when there are UI stories) ---
let browserResults = []
if (strategy.uiStories.length > 0) {
  phase('Author stories')
  const authored = await agent(
    `Write these UI user stories to a single YAML file at ${runDir}/user-stories/stories.yaml using the Bowser story format ('stories:' array; each item has name, url, and a 'workflow: |' block of imperative steps). Create the directory. Return the file path and the list of stories with their slugs.\n\nStories:\n${JSON.stringify(strategy.uiStories, null, 2)}`,
    { agentType: 'qa-suite-pro-story-author', phase: 'Author stories', schema: AUTHOR_SCHEMA }
  )
  log(`Authored ${authored.stories.length} story file entries at ${authored.storiesFile}`)

  phase('Browse')
  browserResults = (await parallel(strategy.uiStories.map(story => () =>
    agent(
      `Execute this UI user story in a headless browser via playwright-cli, step by step, screenshotting after every step into ${runDir}/screenshots/${story.slug}/. Report pass/fail per the browser-runner contract, capturing JS console errors on failure.\n\nStory name: ${story.name}\nStart URL: ${story.url}\nSteps:\n${story.workflow}`,
      { agentType: 'qa-suite-pro-browser-runner', label: `browse:${story.slug}`, phase: 'Browse', schema: BROWSER_SCHEMA }
    )
  ))).filter(Boolean)
  const passed = browserResults.filter(r => r.status === 'pass').length
  log(`Browser E2E: ${passed}/${browserResults.length} stories passed`)
} else {
  log('No UI stories - skipping browser E2E phase')
}

// --- Phase 7: Report ---
phase('Report')
const report = await agent(
  `Write a QA report in markdown for this target, covering BOTH the code-test results and the browser E2E results. Include: overall verdict, code strategy + coverage vs matrix + gaps still open, actual code-test run results and defects, and the browser story results (per story: pass/fail, steps, screenshot dir, console errors on failure) with the screenshots root at ${runDir}/screenshots/. End with remaining risk and a clear ship / do-not-ship recommendation. Be honest about anything unverified.\n\nTarget: ${scope.target}\nRun dir: ${runDir}\n\nStrategy:\n${JSON.stringify(strategy, null, 2)}\n\nCode engineering:\n${JSON.stringify(engineering, null, 2)}\n\nCode coverage verdict:\n${JSON.stringify(coverage, null, 2)}\n\nBrowser E2E results:\n${JSON.stringify(browserResults, null, 2)}`,
  { agentType: 'qa-suite-pro-reporter' }
)

return { scope, strategy, engineering, coverage, browserResults, runDir, report }

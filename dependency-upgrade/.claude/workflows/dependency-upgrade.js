export const meta = {
  name: 'dependency-upgrade',
  description: 'Assess a dependency upgrade (breaking changes, security advisories, migration plan), apply it, and verify the build/tests still pass',
  phases: [
    { title: 'Assess', detail: 'parallel: breaking-change analysis, security-advisory check, migration planning' },
    { title: 'Apply', detail: 'bump the version and apply the required code changes' },
    { title: 'Verify', detail: 'run the real build and test suite, loop back to Apply on failure (capped)' },
  ],
}

const BREAKING_SCHEMA = {
  type: 'object',
  properties: {
    breakingChanges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          change: { type: 'string' },
          affectedSites: { type: 'array', items: { type: 'string' } },
        },
        required: ['change'],
      },
    },
    deprecations: { type: 'array', items: { type: 'string' } },
    riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
    notes: { type: 'string' },
  },
  required: ['breakingChanges', 'riskLevel'],
}

const SECURITY_SCHEMA = {
  type: 'object',
  properties: {
    currentVersionAdvisories: { type: 'array', items: { type: 'string' } },
    targetVersionAdvisories: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string', enum: ['improves_posture', 'neutral', 'introduces_exposure'] },
    urgency: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    notes: { type: 'string' },
  },
  required: ['recommendation', 'urgency'],
}

const MIGRATION_SCHEMA = {
  type: 'object',
  properties: {
    steps: { type: 'array', items: { type: 'string' } },
    ciImpact: { type: 'string' },
    rollbackPlan: { type: 'string' },
    manualSignOffNeeded: { type: 'array', items: { type: 'string' } },
  },
  required: ['steps', 'rollbackPlan'],
}

const APPLY_SCHEMA = {
  type: 'object',
  properties: {
    dependency: { type: 'string' },
    fromVersion: { type: 'string' },
    toVersion: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    changeSummary: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['dependency', 'filesChanged'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    buildResult: { type: 'string', enum: ['pass', 'fail', 'not_applicable'] },
    testResult: { type: 'string', enum: ['pass', 'fail', 'not_applicable'] },
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    failureDetail: { type: 'string' },
    preExistingIssuesIgnored: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict'],
}

let parsedArgs = args
if (typeof parsedArgs === 'string') {
  try {
    parsedArgs = JSON.parse(parsedArgs)
  } catch (e) {
    parsedArgs = null
  }
}

const dependency = parsedArgs && typeof parsedArgs === 'object' && parsedArgs.dependency
const fromVersion = parsedArgs && typeof parsedArgs === 'object' && parsedArgs.fromVersion
const toVersion = parsedArgs && typeof parsedArgs === 'object' && parsedArgs.toVersion
const scope = (parsedArgs && typeof parsedArgs === 'object' && parsedArgs.scope) || 'the whole repository'
if (!dependency || !toVersion) {
  throw new Error(
    'Missing required fields. Call this workflow with args shaped ' +
    '{ "dependency": "<name>", "fromVersion": "<current version, optional>", "toVersion": "<target version>", "scope": "<repo path, optional>" } ' +
    'as an actual object in the tool call, not a JSON-encoded string.'
  )
}

const context = `Dependency: ${dependency}\nCurrent version: ${fromVersion || 'unspecified - detect it from the manifest in scope'}\nTarget version: ${toVersion}\nScope: ${scope}`

// --- Phase 1: Assess (two independent lenses in parallel, then an informed migration plan) ---
phase('Assess')
const [breaking, security] = await parallel([
  () => agent(
    `Identify breaking API/behavior changes for this upgrade.\n${context}`,
    { agentType: 'dependency-upgrade-breaking-change-analyst', label: 'assess:breaking', phase: 'Assess', schema: BREAKING_SCHEMA }
  ),
  () => agent(
    `Check security advisories for this upgrade.\n${context}`,
    { agentType: 'dependency-upgrade-security-advisor', label: 'assess:security', phase: 'Assess', schema: SECURITY_SCHEMA }
  ),
])
if (!breaking || !security) {
  throw new Error(
    `Assess phase failed: ${!breaking ? 'breaking-change analyst' : 'security advisor'} returned no result ` +
    '(subagent error or terminal API failure) - cannot plan a safe migration without both lenses.'
  )
}
log(`Assessment complete: breaking-change risk=${breaking.riskLevel}, security=${security.recommendation} (urgency ${security.urgency})`)

// Migration plan runs after the two lenses so it can sequence around the real breakage and advisories.
const migration = await agent(
  `Plan the safe migration sequence for this upgrade, using the breaking-change and security findings below to order the steps.\n${context}\n\nBreaking-change findings:\n${JSON.stringify(breaking, null, 2)}\n\nSecurity findings:\n${JSON.stringify(security, null, 2)}`,
  { agentType: 'dependency-upgrade-migration-planner', label: 'assess:migration', phase: 'Assess', schema: MIGRATION_SCHEMA }
)

// --- Phase 2/3: Apply -> Verify, capped revise loop ---
const MAX_ROUNDS = 3
let round = 0
let apply = await agent(
  `Apply this dependency upgrade.\n${context}\n\nBreaking-change findings:\n${JSON.stringify(breaking, null, 2)}\n\nMigration plan:\n${JSON.stringify(migration, null, 2)}`,
  { agentType: 'dependency-upgrade-applier', phase: 'Apply', schema: APPLY_SCHEMA }
)

let verify
while (round < MAX_ROUNDS) {
  phase('Verify')
  verify = await agent(
    `Run the real build and test suite to verify this applied upgrade.\n${context}\nFiles changed by the applier: ${JSON.stringify(apply.filesChanged)}`,
    { agentType: 'dependency-upgrade-verifier', phase: 'Verify', schema: VERIFY_SCHEMA }
  )

  if (verify.verdict === 'pass') break

  round++
  if (round >= MAX_ROUNDS) {
    log(`Round cap (${MAX_ROUNDS}) reached - handing back best attempt (verify verdict: ${verify.verdict})`)
    break
  }

  log(`Verify failed, revising: ${verify.failureDetail}`)
  phase('Apply')
  apply = await agent(
    `Fix this verification failure from your previous upgrade attempt. Keep working changes that were not implicated in the failure.\n${context}\nPrevious files changed: ${JSON.stringify(apply.filesChanged)}\nVerify failure detail: ${verify.failureDetail}`,
    { agentType: 'dependency-upgrade-applier', phase: 'Apply', schema: APPLY_SCHEMA }
  )
}

return { breaking, security, migration, apply, verify, rounds: round + 1 }

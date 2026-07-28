export const meta = {
  name: 'task-breakdown',
  description: 'Turn an existing PRD - plus its linked tech-stack, architecture, and design-system documents - into a short, reference-only task index that always opens with the fixed repo/infra/toolchain/gallery bootstrap sequence, updates incrementally when re-run against an existing index, and archives completed tasks once they are safely done',
  phases: [
    { title: 'Frame', detail: 'read the PRD and whatever it links to; read the existing index too, if updating' },
    { title: 'Draft', detail: 'write or incrementally update the task index, write-to-disk-return-status' },
    { title: 'Archive', detail: 'move qualifying done tasks to the archive, collapse their row, incremental runs only' },
    { title: 'Critique', detail: 'parallel adversarial review: traceability, dependency-integrity (opus: judgment)' },
    { title: 'Revise', detail: 're-author only the flagged tasks, then re-review, capped' },
  ],
}

const FRAME_SCHEMA = {
  type: 'object',
  properties: {
    prdFound: { type: 'boolean' },
    productSummary: { type: 'string' },
    mode: { type: 'string', enum: ['initial', 'incremental'] },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          description: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['id', 'description'],
      },
    },
    architectureComponents: {
      type: 'array',
      items: {
        type: 'object',
        properties: { component: { type: 'string' }, responsibility: { type: 'string' } },
        required: ['component'],
      },
    },
    designSystemComponents: {
      type: 'array',
      items: {
        type: 'object',
        properties: { component: { type: 'string' }, location: { type: 'string' }, group: { type: 'string' } },
        required: ['component'],
      },
    },
    galleryLocation: { type: 'string' },
    techStackLinked: { type: 'boolean' },
    architectureLinked: { type: 'boolean' },
    designSystemLinked: { type: 'boolean' },
    existingTasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' } },
          completedAt: { type: 'string' },
        },
        required: ['id', 'title', 'status'],
      },
    },
    assumptions: { type: 'array', items: { type: 'string' } },
    openQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, blocking: { type: 'boolean' } },
        required: ['question'],
      },
    },
  },
  required: ['prdFound', 'productSummary', 'mode', 'requirements'],
}

const TASKS_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    archivePath: { type: 'string' },
    charCount: { type: 'number' },
    version: { type: 'string' },
    mode: { type: 'string', enum: ['initial', 'incremental'] },
    taskCount: { type: 'number' },
    prdLinked: { type: 'boolean' },
  },
  required: ['path', 'archivePath', 'charCount', 'version'],
}

const ARCHIVE_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    archivePath: { type: 'string' },
    charCount: { type: 'number' },
    version: { type: 'string' },
    archivedCount: { type: 'number' },
  },
  required: ['path', 'archivePath', 'charCount', 'version', 'archivedCount'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['ready', 'needs_revision'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          issue: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'minor'] },
        },
        required: ['taskId', 'issue'],
      },
    },
  },
  required: ['lens', 'verdict', 'issues'],
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

const prdPath = typeof input === 'string' ? input : input && input.prd
if (!prdPath) {
  throw new Error(
    'Missing the PRD path. This workflow designs task breakdowns FOR a PRD that already exists - call it with ' +
    'args shaped { "prd": "path to a PRD", "existingTasksPath": "optional path to an existing tasks.md, for an incremental run", "date": "YYYY-MM-DD" }.'
  )
}
const existingTasksPath = (input && typeof input === 'object' && input.existingTasksPath) || null
const date = (input && typeof input === 'object' && input.date) || 'unknown - fill in before this leaves Draft'
const ARCHIVE_GRACE_DAYS = 14

// Derive the folder name from the PRD's own filename (the same stem convention as
// tech-stack-selector.js, architecture-designer.js, and design-system-foundation-v2.js) so
// this package's output folder always agrees with docs/product-specs/, docs/architecture/,
// docs/design-system/, docs/testing/, and docs/qa-reports/ - instead of drifting from a
// re-derived, unstable product-summary sentence.
function stemFor(prdPath) {
  const base = prdPath.slice(prdPath.lastIndexOf('/') + 1)
  return base.replace(/\.md$/i, '').replace(/-?prd$/i, '') || 'untitled'
}

// --- Phase 1: Frame (single agent, sequential) ---
phase('Frame')
const frame = await agent(
  `Read the PRD at ${prdPath} and turn it, plus whatever tech-stack/architecture/design-system documents its Links row points to, into a task-breakdown brief.\n\n` +
  (existingTasksPath
    ? `An existing task index exists at ${existingTasksPath} - read it too and run in incremental mode.`
    : `No existing task index was given - run in initial mode.`),
  { agentType: 'task-framer', schema: FRAME_SCHEMA }
)
if (!frame.prdFound) {
  throw new Error(
    `No PRD could be read at ${prdPath} - this workflow breaks a product that already has a PRD into tasks, it does not invent one. Run /prd-generator-v2 first, or check the path.`
  )
}
if (!frame.requirements || frame.requirements.length === 0) {
  throw new Error('The framer found no requirements in the PRD - there is nothing to break into tasks.')
}
log(
  `Framed "${frame.productSummary}" - ${frame.requirements.length} requirement(s), mode=${frame.mode}` +
  (frame.mode === 'incremental' ? `, ${frame.existingTasks.length} existing task(s)` : '') +
  ` - tech-stack linked: ${frame.techStackLinked}, architecture linked: ${frame.architectureLinked}, design-system linked: ${frame.designSystemLinked}`
)

const stem = stemFor(prdPath)
const tasksPath = existingTasksPath || `docs/tasks/${stem}/tasks.md`
const archivePath = existingTasksPath ? existingTasksPath.replace(/tasks\.md$/i, 'tasks-archive.md') : `docs/tasks/${stem}/tasks-archive.md`

const authorContext =
  `Product: ${frame.productSummary}\n` +
  `Requirements:\n${JSON.stringify(frame.requirements, null, 2)}\n\n` +
  `Architecture components (empty if not linked):\n${JSON.stringify(frame.architectureComponents || [], null, 2)}\n\n` +
  `Design-system components (empty if not linked):\n${JSON.stringify(frame.designSystemComponents || [], null, 2)}\n\n` +
  `Gallery location: ${frame.galleryLocation || 'not linked'}\n\n` +
  `Tech-stack linked: ${frame.techStackLinked}, architecture linked: ${frame.architectureLinked}, design-system linked: ${frame.designSystemLinked}\n\n` +
  `Existing tasks (empty on an initial run):\n${JSON.stringify(frame.existingTasks || [], null, 2)}\n\n` +
  `Date to use: ${date}`

// --- Phase 2: Draft/Update (single agent, sequential - it must see every existing task to add IDs safely) ---
phase('Draft')
let draftStatus = await agent(
  `Write the task index to ${tasksPath} and the archive scaffold to ${archivePath}. Mode: ${frame.mode}.\n\n${authorContext}` +
  (frame.mode === 'initial'
    ? `\n\nThis run also owns the PRD link: read the PRD at ${prdPath}, find its header Links row, and add or replace the "Tasks" reference to point at ${tasksPath}. Report the result as prdLinked.`
    : `\n\nDo not touch the PRD - it was already linked on the initial run. Only append rows for requirements not yet covered; do not modify any existing row.`),
  { agentType: 'task-author', schema: TASKS_STATUS_SCHEMA }
)
log(`Task index ${frame.mode === 'initial' ? 'written' : 'updated'} at ${draftStatus.path} (${draftStatus.taskCount} task(s), ${draftStatus.charCount} chars, ${draftStatus.version})`)

// --- Phase 3: Archive (single agent, sequential - only meaningful once tasks have had time to complete) ---
let archivedCount = 0
if (frame.mode === 'incremental') {
  phase('Archive')
  const archiveResult = await agent(
    `Move qualifying done tasks from ${draftStatus.path} to ${draftStatus.archivePath}. Today's date: ${date}. Grace period: ${ARCHIVE_GRACE_DAYS} days since completion. ` +
    `A task qualifies only if it is done, has been done for at least the grace period, and nothing still pending/in_progress depends on it.`,
    { agentType: 'task-archiver', schema: ARCHIVE_STATUS_SCHEMA }
  )
  if (archiveResult) {
    archivedCount = archiveResult.archivedCount || 0
    log(`Archive pass: ${archivedCount} task(s) moved to ${archiveResult.archivePath}`)
    draftStatus = { ...draftStatus, charCount: archiveResult.charCount, version: archiveResult.version }
  }
}

// --- Phase 4/5: Critique -> Revise loop (parallel lenses over the whole index, capped rounds) ---
const CRITIQUE_LENSES = ['traceability', 'dependency-integrity']
const MAX_ROUNDS = 2
const MAX_OPEN_ISSUES = 15
let round = 0
let allCritiques = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIQUE_LENSES.map(lens => () =>
    agent(
      `The task index lives at ${draftStatus.path} (archive at ${draftStatus.archivePath}) - read it, and re-read the brief below, before reviewing.\n\n${authorContext}\n\n` +
      `Review the whole task index through the ${lens} lens only. Be adversarial. List every checklist item that fails and route each issue to the task ID that owns the fix.`,
      { agentType: 'task-critic', label: `critique:${lens}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, model: 'opus' }
    )
  ))).filter(Boolean)
  allCritiques = critiques

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  if (needsWork.length === 0) {
    log('Both lenses signed off - the task index is ready')
    break
  }

  round++
  if (round >= MAX_ROUNDS) {
    const open = needsWork.reduce((n, c) => n + (c.issues || []).length, 0)
    log(`Round cap (${MAX_ROUNDS}) reached with ${needsWork.length}/${critiques.length} lens(es) still flagging ${open} issue(s) - returning the best index`)
    break
  }

  const issuesByTask = []
  for (const c of needsWork) {
    for (const issue of (c.issues || [])) {
      issuesByTask.push({ lens: c.lens, taskId: issue.taskId, severity: issue.severity || 'unstated', issue: issue.issue })
    }
  }
  if (issuesByTask.length === 0) {
    log('Lenses flagged needs_revision but routed no issue to any task - nothing actionable, stopping')
    break
  }

  phase('Revise')
  log(`Revising round ${round}: ${issuesByTask.length} issue(s) across ${new Set(issuesByTask.map(i => i.taskId)).size} task(s)`)
  const revised = await agent(
    `Revise the task index at ${draftStatus.path} to fix exactly these issues, and nothing else. Do not touch any row not named below.\n\n` +
    `<issues>\n${JSON.stringify(issuesByTask, null, 2)}\n</issues>`,
    { agentType: 'task-author', label: `revise:round-${round}`, phase: 'Revise', schema: TASKS_STATUS_SCHEMA }
  )
  if (revised) draftStatus = revised
}

const allOpenIssues = allCritiques
  .filter(c => c.verdict === 'needs_revision')
  .flatMap(c => (c.issues || []).map(i => ({ lens: c.lens, taskId: i.taskId, severity: i.severity || 'unstated', issue: i.issue })))
const openIssues = allOpenIssues.slice(0, MAX_OPEN_ISSUES)

let prdLinked = false
// prdLinked only ever comes back true from the initial-run draft call, never from a revise call.
if (frame.mode === 'initial') {
  const initialDraftReport = draftStatus
  prdLinked = Boolean(initialDraftReport && initialDraftReport.prdLinked)
}

return {
  productSummary: frame.productSummary,
  mode: frame.mode,
  requirementCount: frame.requirements.length,
  taskCount: draftStatus.taskCount,
  archivedThisRun: archivedCount,
  roundsRun: round,
  openIssues,
  openIssuesTotal: allOpenIssues.length,
  tasksPath: draftStatus.path,
  archivePath: draftStatus.archivePath,
  taskIndexVersion: draftStatus.version,
  prdPath,
  prdLinked,
}

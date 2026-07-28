export const meta = {
  name: 'context-bloat-forensics',
  description: 'Audit a folder of Claude Code transcripts for context-bloat: oversized inputs, duplicated content, unbounded loops, redundant agents, scratch-file sprawl',
  phases: [
    { title: 'Discover', detail: 'enumerate transcript files in the folder, chronologically, without reading contents' },
    { title: 'Narrate', detail: 'per file: reconstruct what happened as a structured timeline' },
    { title: 'Critique', detail: 'per file: find evidenced context-bloat anti-patterns in that timeline' },
    { title: 'Synthesize', detail: 'merge all timelines and findings into one report' },
  ],
}

const DISCOVERY_SCHEMA = {
  type: 'object',
  properties: {
    folder: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          sizeBytes: { type: 'number' },
          estimatedTokens: { type: 'number' },
          modifiedAt: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['workflow-journal', 'agent-transcript', 'session-transcript', 'unknown'],
            description: 'workflow-journal: journal.jsonl from a Workflow tool run. agent-transcript: agent-<id>.jsonl for one spawned subagent. session-transcript: a raw top-level session transcript, not scoped to one agent. unknown: does not match a recognized name/shape - guess from content only if you already read it, otherwise leave as unknown.',
          },
        },
        required: ['path', 'sizeBytes', 'kind'],
      },
    },
  },
  required: ['folder', 'files'],
}

const TIMELINE_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    readMode: {
      type: 'string',
      enum: ['full', 'sampled'],
      description: 'full: you read the entire file. sampled: the file was too large to read in full so you read a representative subset (start/end/around key events) per your instructions.',
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['command_invoked', 'agent_spawned', 'file_read', 'file_write', 'error', 'unclear', 'other'],
            description: 'command_invoked: a tool/shell command ran. agent_spawned: a subagent was launched. file_read/file_write: a file was read or written. error: something failed or was rejected. unclear: the transcript does not make the event type identifiable. other: a real event that does not fit the other categories.',
          },
          description: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['type', 'description', 'evidence'],
      },
    },
  },
  required: ['file', 'events'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          severity: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'high: materially inflated token cost or a real risk of hitting context limits (e.g. an unbounded loop, a full file read that should have been a reference). medium: a real inefficiency but bounded in impact. low: a minor or one-off inefficiency not worth restructuring the workflow for.',
          },
          summary: { type: 'string' },
          evidence: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['category', 'severity', 'summary', 'evidence', 'recommendation'],
      },
    },
  },
  required: ['file', 'findings'],
}

let input = args
if (typeof input === 'string') {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object') input = parsed
  } catch {
    // not JSON - a genuine plain-string argument, keep as-is
  }
}

const folder = typeof input === 'string' ? input : input && input.folder
if (!folder) {
  throw new Error(
    'Missing the folder to audit. Call this workflow with args set to either a plain string ' +
    '(the folder path itself) or an object shaped { "folder": "/path/to/transcripts" }.'
  )
}

// --- Phase 1: Discover (single agent, sequential) ---
phase('Discover')
const discovery = await agent(
  `Enumerate the transcript-like files under this folder, chronologically, with size metadata only - do not read file contents: ${folder}`,
  { agentType: 'context-bloat-forensics-discoverer', schema: DISCOVERY_SCHEMA, effort: 'low' }
)
log(`Found ${discovery.files.length} candidate file(s) under ${discovery.folder}`)

if (discovery.files.length === 0) {
  return { folder: discovery.folder, files: [], report: 'No transcript-like files found under this folder - nothing to audit.' }
}

// --- Phase 2/3: Narrate -> Critique per file (pipelined, no barrier between files) ---
const perFile = await pipeline(
  discovery.files,
  f => agent(
    `Reconstruct the chronological timeline of what happened in this transcript file. Path: ${f.path}. ` +
    `Size on disk: ${f.sizeBytes} bytes (~${f.estimatedTokens || Math.round(f.sizeBytes / 4)} estimated tokens). Guessed kind: ${f.kind}. ` +
    `Follow your instructions on sampling vs. full read based on this size before you start.`,
    { agentType: 'context-bloat-forensics-narrator', phase: 'Narrate', schema: TIMELINE_SCHEMA }
  ),
  (timeline, f) => timeline
    ? agent(
        `Review this timeline for context-bloat anti-patterns, spot-checking the original file when you need to confirm a finding.\n\n` +
        `Original file: ${f.path}\n\nTimeline:\n${JSON.stringify(timeline, null, 2)}`,
        { agentType: 'context-bloat-forensics-critic', phase: 'Critique', schema: CRITIQUE_SCHEMA }
      ).then(critique => ({ file: f, timeline, critique }))
    : null
)

const valid = perFile.filter(Boolean)
log(`Narrated and critiqued ${valid.length}/${discovery.files.length} file(s)`)

// --- Phase 4: Synthesize (barrier - needs every file's results together) ---
phase('Synthesize')
const report = await agent(
  `Synthesize one consolidated report from these per-file timelines and findings, covering every transcript audited in folder ${discovery.folder}.\n\n` +
  JSON.stringify(valid.map(v => ({ file: v.file.path, timeline: v.timeline, findings: v.critique.findings })), null, 2),
  { agentType: 'context-bloat-forensics-synthesizer', effort: 'high' }
)

return { folder: discovery.folder, files: discovery.files, details: valid, report }

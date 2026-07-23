---
description: Answer a "should we adopt X" or "how is Y usually solved" question - four independent multi-modal research lenses, each fact-checked, synthesized into an options matrix and a recommendation with a stated confidence level
argument-hint: [the research question, e.g. "should we adopt Temporal for our job queue" or "how do teams usually handle multi-tenant DB isolation" - defaults to asking what to research]
---

Research this question: $ARGUMENTS

1. Determine the question to research:
   - If `$ARGUMENTS` states a decision question or a "how is X usually solved" question, use it directly as the question.
   - If `$ARGUMENTS` also names relevant repo/stack context (current stack, team constraints, prior art in this codebase), include it as context.
   - If `$ARGUMENTS` is empty, ask the user what they want researched before proceeding - do not guess a question.

2. Call the Workflow tool now, as an actual tool call (not a description of one), with:
   - `scriptPath`: `.claude/workflows/spike-research.js`
   - `args`: a JSON object literal `{ "question": "<the research question>", "context": "<repo/stack/team context, if known>" }` (an actual object in the tool call payload, NOT a JSON-encoded string).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

3. When it returns, show the user the `report` field directly (the options matrix, recommendation, and confidence level). Mention how many of the four lenses (official, community, alternatives, risk) returned verified findings, so the user knows how thorough the evidence base actually was.

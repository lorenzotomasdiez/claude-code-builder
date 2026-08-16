---
description: Run a fast four-phase system design sprint in the conversation - clarify, requirements, estimate, architecture - and end with a summary ready to hand to /lavish. Writes no files.
argument-hint: <what to design, in a sentence or two>
---

Run a system design sprint for: $ARGUMENTS

You are the orchestrator and you stay in the conversation the whole time. This command deliberately has no
workflow script and produces **no files**: Phase 1 requires asking the human real questions, which a
background workflow cannot do, and the whole output is meant to live in the chat where the human can push
back on it in one line. Do not create, write, or edit any file at any point, including scratch notes.

If `$ARGUMENTS` is empty, ask what to design in one line and stop until they answer. Everything else about
this sprint is designed to avoid blocking on the human twice.

## Phase 1 - clarify (one blocking round)

Send **both of these in the same message**, so the scout works while the human types:

1. Launch **`sds-context-prober`** with the Agent tool, `run_in_background: true`, telling it what is being
   designed. It scans the repo for constraints that outrank anything the human will guess at.
2. Call **AskUserQuestion** with up to four questions, each carrying concrete options you propose - not open
   prompts. The human should be able to click four times and be done. Cover:
   - **Users** - who uses it, internal or external, and roughly how many.
   - **Scope** - which single flow or feature this sprint covers. Offer a genuinely narrow option and
     recommend it. Cutting scope here is the highest-value move in the sprint, and a narrower answer than
     the human expected to give is a good outcome, not a failure to be helpful.
   - **Scale** - an order of magnitude, offered as ranges (hundreds / thousands / hundreds of thousands).
     They pick a bucket; they do not do arithmetic.
   - **Constraints** - `multiSelect: true` over the ones that actually change designs: PII or regulated
     data, proprietary IP, on-prem or data-residency requirement, hard cost ceiling, must integrate with an
     existing system, none of these.

Do not ask about the success metric. Propose one yourself in the recap below and let the human correct it -
a fifth question buys less than it costs.

Then recap the locked brief in **five lines** - users, scope, scale, constraints, success metric - folding in
whatever the prober found, and saying explicitly where the prober's evidence overrides an answer (a real
number in a load test beats a guessed bucket). Say "correct any line or I proceed", then proceed immediately
in the same message. Do not wait for a second confirmation. If the human corrects something after the fact,
re-run the affected phase only.

## Phases 2-4 - fan out in parallel

Launch all three in **one message**, each with the full locked brief and the prober's findings:

- **`sds-nfr-analyst`** - Phase 2, functional list and the non-functional attributes that bind.
- **`sds-sizer`** - Phase 3, back-of-the-envelope numbers and what class of system they demand.
- **`sds-architect`** - Phase 4, the boxes and the five decision questions.

They are independent on purpose. Chaining them would be slower and worse: an architect who has already read
a sizing verdict will rationalize toward it instead of designing, and the disagreements between three
independent passes are exactly what the next phase mines. Do not tell any of them what the others are doing.

## Phase 5 - one adversarial pass

Launch **`sds-skeptic`** with all three outputs plus the brief. One pass, no revise loop - this sprint is
optimized for speed, and the human is a better second reviewer than another round of agents.

Where the skeptic finds a contradiction, resolve it yourself in the synthesis and say which side you took and
why. Do not relaunch the three agents to reconcile; that trades the sprint's whole speed advantage for
consistency the human can supply in one sentence.

## Phase 6 - synthesize in the chat

Write the final summary directly in the conversation, in this order and nothing else:

1. **The brief** - the five locked lines.
2. **Requirements** - the functional bullets, then the 2-3 binding non-functionals with what each forces, then
   the dismissed ones in one compact line. The dismissals are load-bearing: they justify what you did not build.
3. **The numbers** - traffic, storage, read/write ratio, and the sizer's verdict on what class of system this is.
4. **The architecture** - the ASCII diagram, then one justified line per box, then the five decisions.
5. **What is shaky** - the skeptic's surviving findings, the contradictions you resolved and which way, and the
   assumptions the whole thing rests on. Lead this section with whatever would hurt most if wrong.
6. **Next question** - the single thing that most needs an answer before anyone builds this.

Keep it readable in one scroll. You are compressing four agent outputs, not concatenating them.

## Phase 7 - hand off

Close with one line offering to run `/lavish` on the summary to turn it into a reviewable visual artifact.
Offer it; do not run it. Only invoke `/lavish` if the human says yes.

If the human asks for the design as a document instead, tell them this command intentionally writes nothing,
and that a separate command handles persisting a finished design.

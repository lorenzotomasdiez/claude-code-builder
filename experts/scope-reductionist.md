# Expert knowledge: Scope Reductionist

Source knowledge to distill into workflow subagents. Not an agent itself.

The role exists because every group of experts, working in good faith, converges on more than is needed. Each seat adds what is correct from its own lens, nobody owns the total, and the sum quietly becomes a twelve-month build. The reductionist owns the total.

## The core question

- Not "is this good?" but "what happens if we do not build it?" - if the honest answer is "nothing much, for a while", it is not in the first version
- Separate what the product must do to be worth using at all from what makes it better once people already use it
- The test of a cut is not whether someone objects; it is whether the objection names a user who abandons the product without it

## Frameworks for cutting

- Shape Up (Basecamp): fixed appetite, variable scope - decide what the thing is worth spending first, then fit the solution inside it, rather than estimating an unbounded design
- Walking skeleton: the thinnest end-to-end slice that exercises every layer of the real system, shipped before any layer is built out
- YAGNI and the cost of speculative generality: abstraction built for a future requirement is usually the wrong abstraction, paid for twice
- MVP as an experiment with a hypothesis and a decision rule, not as "version one with fewer buttons"
- Riskiest Assumption Test: build the smallest thing that tests the assumption most likely to kill the product, not the smallest complete product
- Cost of delay and the value of learning early: a smaller thing in users' hands is worth more than a larger thing still in design
- MoSCoW abused as "everything is Must" is the failure mode to watch for - force a ranked list, not four buckets

## Reduction moves, roughly in order of leverage

1. Cut the user segment: serve one specific user completely instead of three partially - most scope comes from serving everyone
2. Cut the use case: one job done end to end beats five jobs half-covered
3. Cut the automation: a human doing it manually behind the product is a valid v1 (concierge/Wizard-of-Oz), and it buys real evidence about what to automate
4. Buy, rent, or orchestrate instead of building: auth, billing, email, search, analytics, admin panels are almost never the differentiator
5. Cut the configurability: one opinionated default beats a settings screen - every option is a branch of code, docs, support, and test
6. Cut the state: features that need no persistence, no accounts, or no sync are dramatically cheaper than ones that do
7. Cut the surface: fewer screens, fewer roles, fewer integrations, fewer platforms - a web app before a native app, one integration before a plugin framework
8. Defer the scale: build for the traffic that actually exists, with a note on the first thing that would break

## What is NOT a legitimate cut

- Cutting the thing the product is for - reduction that removes the reason to use it is not reduction, it is cancellation by increments
- Cutting security, authorization, data-loss prevention, or legal/regulatory obligations - these are not features
- Cutting accessibility to a "later" bucket that never arrives; it is far cheaper designed in than retrofitted
- Cutting the instrumentation that tells you whether the small version worked - that is how the next cut gets decided
- Cutting quality to fit a date and calling it scope reduction - shipping less is a cut, shipping the same thing badly is debt
- Cutting so hard the result cannot grow: the minimal version should be a foundation, not a dead end that must be thrown away

## Communicating a cut

- Name what is being cut, why, and the observable signal that would bring it back - a cut with a re-entry condition is accepted far more easily than a refusal
- State the minimal version as a positive claim about what it does, not as a list of deletions
- Distinguish "not now" from "not ever", explicitly, for each item - conflating them is what makes stakeholders fight cuts
- Put the cut in front of the people who proposed the scope, not behind them - a reduction nobody argued with was not a real reduction

## Classic reference points

- "The best code is no code at all" - the cheapest feature is the one not built
- The Mythical Man-Month: scope added late costs more than scope added early, and adding people does not recover it
- Lean Startup: build-measure-learn, and the validated-learning framing of a first release
- Gall's Law: complex systems that work evolved from simple systems that worked - a complex system designed from scratch does not work and cannot be patched into working

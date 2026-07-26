# Expert knowledge: Business Strategist

Source knowledge to distill into workflow subagents. Not an agent itself.

Distinct from `marketing-expert.md` (how it reaches and converts a market) and from `product-owner.md` (what gets built next). This role owns whether the thing can pay for itself and whether it should exist as a business at all.

## Business model design

- Business Model Canvas and Value Proposition Canvas as structural checklists: who pays, for what, how often, and what it costs to serve them
- Revenue models and what each demands of the product: subscription, usage-based, seat-based, transactional/take-rate, licensing, services-plus-software, marketplace, freemium, ads
- The model dictates the product: usage-based pricing needs metering and cost attribution designed in; freemium needs a free tier that is genuinely useful yet clearly limited; marketplaces need a supply-side answer before a demand-side one
- Two-sided and multi-sided models: which side is hard to acquire, and what the cold-start plan is (Currency of the chicken-and-egg problem)
- Value metric selection: charge for something that grows as the customer gets more value, is predictable enough to budget, and cannot be gamed

## Unit economics

- CAC, LTV, LTV:CAC ratio, payback period, gross margin, contribution margin, churn and net revenue retention
- Payback period matters more than LTV:CAC for anyone who is not sitting on capital - LTV is a forecast, payback is a cash-flow fact
- Cost to serve is a product decision, not a finance one: inference cost per request, storage, support load per account, and manual operations all sit inside gross margin
- For AI-native products specifically: variable inference cost against a flat subscription price is the classic margin trap - model the cost per active user at the intended usage level before committing to a price
- The margin structure determines what kind of company this can be: a 30% gross-margin product cannot fund a software go-to-market

## Pricing

- Price is positioning: the number tells the market what category you are in, before any feature does
- Value-based pricing over cost-plus; anchor to the cost of the problem or the alternative being replaced, not to the effort of building
- Willingness to pay is researchable before build (Van Westendorp, conjoint, or simply asking what they pay today for the workaround)
- Packaging and tiering: what gates a tier should map to a value metric, not to arbitrary feature withholding
- Changing price later is expensive and constrained by installed base - it is a first-version decision, not a later one

## Viability and strategy

- "Good Strategy Bad Strategy" (Rumelt): a real strategy names the crux and concentrates resources on it; a list of goals and platitudes is not strategy
- Where does the durable advantage come from - proprietary data, workflow lock-in, network effects, switching costs, brand, regulatory access, or cost structure? If the honest answer is "nothing", say so, because the feature will be copied
- Build vs buy vs partner vs orchestrate, evaluated on whether the capability is the differentiator or table stakes
- Market sizing done bottom-up (reachable customers x realistic price x realistic conversion), never top-down from an industry report
- Time to first revenue, cash runway, and what the smallest commercially viable version is - which is frequently smaller than the smallest technically coherent one
- Concentration risk in client work: one client funding a product is revenue, not product-market fit

## Cost, risk, and constraints

- Total cost of ownership past launch: support, hosting, compliance, maintenance, and the cost of keeping a model or dependency current
- Regulatory and compliance exposure as a business input (GDPR, sector rules, the EU AI Act) - these set the floor on cost and timeline, and sometimes decide the model
- Liability and insurance exposure for products giving advice, handling money, or acting autonomously
- Opportunity cost: what the same team, budget, and calendar could produce instead - the strongest argument against most proposals

## Honest signals a business case is weak

- Revenue arrives only in a stage nobody has planned for ("we monetize later")
- The value proposition is real but the payer is unidentified, or the payer and the beneficiary are different parties with no bridge between them
- Unit economics only work at a scale the acquisition plan cannot reach
- The differentiator is a feature the incumbent could ship in a quarter
- The whole model depends on a third-party platform, model provider, or channel that can change terms unilaterally

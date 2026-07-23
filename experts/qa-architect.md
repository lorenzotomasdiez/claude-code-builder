# Expert knowledge: QA Architect

Source knowledge to distill into workflow subagents. Not an agent itself.

## Testing strategy fundamentals

- Test pyramid vs testing trophy, and when to apply each model
- Risk-based testing and prioritization by business impact
- Shift-left and shift-right testing (continuous testing across the SDLC)
- Designing multi-team/multi-service testing strategies

## Automation and frameworks

- Playwright (has largely displaced Selenium/Cypress in many stacks)
- Contract testing (Pact, Spring Cloud Contract) for distributed architectures
- Advanced API testing (REST, GraphQL, gRPC) - Postman/Newman, RestAssured
- BDD frameworks (Cucumber, SpecFlow) and their real role vs overuse
- Designing maintainable automation frameworks (Page Object, Screenplay pattern)

## Testing in modern architectures

- Microservices testing: contract testing, service virtualization, chaos engineering
- Testing in event-driven architectures (Kafka, message queues)
- Testing AI/LLM-based systems: prompt evaluation, hallucination detection, non-deterministic testing
- Observability as part of testing (tracing, logs, metrics - OpenTelemetry)

## CI/CD and DevOps

- Integrating testing into pipelines (GitHub Actions, GitLab CI, Jenkins)
- Test parallelization and execution-time optimization
- Feature flags and testing in production (canary, dark launches)
- Infrastructure as Code applied to test environments (Docker, Kubernetes, Terraform)

## Data quality and performance

- Performance testing (k6, Gatling, JMeter) and realistic load modeling
- Data quality testing in data/ML pipelines
- Basic security testing (OWASP Top 10, SAST/DAST integrated in the pipeline)
- Accessibility (WCAG) as a non-negotiable requirement, not optional

## Leadership and architecture

- Defining meaningful quality metrics (not just coverage %, but defect escape rate, MTTR, etc.)
- Managing technical debt in test suites
- Mentoring and establishing quality standards across teams
- Communicating quality risk to non-technical stakeholders

## Emerging trends 2026

- Using generative AI to generate test cases and maintain tests
- Testing autonomous AI agents (multi-step behavior, tool use)
- Self-healing tests and automatic flaky-test detection

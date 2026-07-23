# Expert knowledge: QA Engineer

Source knowledge to distill into workflow subagents. Not an agent itself.

## Fundamentals that never go out of style

- Test case design, black-box/white-box techniques, equivalence partitioning, boundary values
- Testing strategy (test pyramid, risk, prioritization)
- SDLC/STLC, agile methodologies (Scrum, Kanban) and their impact on QA

## Automation

- One solid language: Python, JavaScript/TypeScript, or Java
- Web frameworks: Playwright (dominant today) and Cypress; Selenium still alive in legacy
- API testing: Postman, REST Assured, or custom scripts with requests/httpx
- Mobile: Appium, or native frameworks (Espresso, XCUITest)
- BDD: Cucumber/Gherkin when the team requires it

## CI/CD and DevOps

- Integrating suites into GitHub Actions, GitLab CI, Jenkins
- Basic Docker for reproducible environments
- Test data management and ephemeral environments

## Performance and load

- k6, JMeter, Gatling
- Understanding metrics: latency, throughput, percentiles (p95/p99)

## AI-based testing (relevant in 2026)

- LLM-assisted test generation/maintenance tools (self-healing tests)
- Judging when a flaky test is the environment vs the product
- Testing AI-integrated features: non-deterministic prompts, model response quality evaluation, agent testing

## Basic security

- OWASP Top 10, authentication/authorization testing
- Tools like Burp Suite (basic level) for exploratory pentesting

## Databases and backend

- SQL to validate data
- Understanding microservice architectures, message queues, API contracts (OpenAPI/Swagger)

## Observability

- Reading logs and traces (Datadog, Grafana, ELK) to debug failures in production or CI

## Technical soft skills

- Clear bug reporting (reproducibility, severity, impact)
- Communicating with devs and PMs; understanding the business "why" behind each feature
- Critical thinking to design cases a developer did not consider

## Accessibility

- Basic WCAG, tools like axe-core

# Expert knowledge: QA Architect

Source knowledge to distill into workflow subagents. Not an agent itself.

## Fundamentos de estrategia de testing

- Test pyramid vs testing trophy, y cuándo aplicar cada modelo
- Risk-based testing y priorización basada en impacto de negocio
- Shift-left y shift-right testing (testing continuo en todo el SDLC)
- Diseño de estrategias de testing multi-equipo/multi-servicio

## Automatización y frameworks

- Playwright (ha desplazado bastante a Selenium/Cypress en muchos stacks)
- Contract testing (Pact, Spring Cloud Contract) para arquitecturas distribuidas
- API testing avanzado (REST, GraphQL, gRPC) - Postman/Newman, RestAssured
- Frameworks BDD (Cucumber, SpecFlow) y su rol real vs sobreuso
- Diseño de frameworks de automatización mantenibles (Page Object, Screenplay pattern)

## Testing en arquitecturas modernas

- Testing de microservicios: contract testing, service virtualization, chaos engineering
- Testing en arquitecturas event-driven (Kafka, colas de mensajes)
- Testing de sistemas basados en IA/LLM: evaluación de prompts, detección de alucinaciones, testing no-determinístico
- Observabilidad como parte del testing (tracing, logs, métricas - OpenTelemetry)

## CI/CD y DevOps

- Integración de testing en pipelines (GitHub Actions, GitLab CI, Jenkins)
- Test parallelization y optimización de tiempos de ejecución
- Feature flags y testing en producción (canary, dark launches)
- Infrastructure as Code aplicado a entornos de testing (Docker, Kubernetes, Terraform)

## Calidad de datos y performance

- Testing de performance (k6, Gatling, JMeter) y modelado de carga realista
- Data quality testing en pipelines de datos/ML
- Testing de seguridad básico (OWASP Top 10, SAST/DAST integrado en pipeline)
- Accesibilidad (WCAG) como requisito no negociable, no opcional

## Liderazgo y arquitectura

- Definición de métricas de calidad significativas (no solo cobertura %, sino defect escape rate, MTTR, etc.)
- Gestión de deuda técnica en test suites
- Mentoría y establecimiento de estándares de calidad entre equipos
- Comunicación de riesgo de calidad a stakeholders no técnicos

## Tendencias emergentes 2026

- Uso de IA generativa para generación de casos de prueba y mantenimiento de tests
- Testing de agentes de IA autónomos (comportamiento multi-paso, uso de herramientas)
- Self-healing tests y detección automática de flaky tests

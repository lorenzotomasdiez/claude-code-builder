# Expert knowledge: QA Engineer

Source knowledge to distill into workflow subagents. Not an agent itself.

## Fundamentos que no pasan de moda

- Diseño de casos de prueba, técnicas de caja negra/blanca, partición de equivalencia, valores límite
- Estrategia de testing (pirámide de pruebas, riesgo, priorización)
- SDLC/STLC, metodologías ágiles (Scrum, Kanban) y su impacto en QA

## Automatización

- Un lenguaje sólido: Python, JavaScript/TypeScript o Java
- Frameworks web: Playwright (dominante hoy) y Cypress; Selenium sigue vivo en legacy
- API testing: Postman, REST Assured, o scripts propios con requests/httpx
- Mobile: Appium, o frameworks nativos (Espresso, XCUITest)
- BDD: Cucumber/Gherkin cuando el equipo lo requiera

## CI/CD y DevOps

- Integrar suites en GitHub Actions, GitLab CI, Jenkins
- Docker básico para entornos reproducibles
- Gestión de datos de prueba y entornos efímeros

## Performance y carga

- k6, JMeter, Gatling
- Entender métricas: latencia, throughput, percentiles (p95/p99)

## Testing basado en IA (relevante en 2026)

- Herramientas de generación/mantenimiento de tests asistido por LLMs (self-healing tests)
- Evaluar cuándo un test "flaky" es del entorno vs. del producto
- Testing de features con IA integrada: prompts no deterministas, evaluación de calidad de respuestas de modelos, testing de agentes

## Seguridad básica

- OWASP Top 10, testing de autenticación/autorización
- Herramientas como Burp Suite (nivel básico) para pentesting exploratorio

## Bases de datos y backend

- SQL para validar datos
- Entender arquitecturas de microservicios, colas de mensajes, contratos de API (OpenAPI/Swagger)

## Observabilidad

- Leer logs, trazas (Datadog, Grafana, ELK) para debugging de fallos en producción o CI

## Soft skills técnicas

- Reporting claro de bugs (reproducibilidad, severidad, impacto)
- Comunicación con devs y PMs; entender el "por qué" del negocio detrás de cada feature
- Pensamiento crítico para diseñar casos que un desarrollador no contempló

## Accesibilidad

- WCAG básico, herramientas como axe-core

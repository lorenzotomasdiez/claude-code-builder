# Expert knowledge: Software Architect

Source knowledge to distill into workflow subagents. Not an agent itself.

Follow the practices in "Fundamentals of Software Architecture" and always create the documents the book recommends (ADRs, architecture characteristics, component diagrams) so later agents can consume them.

## Fundamentos que no caducan

- Patrones arquitectónicos: microservicios, monolito modular, event-driven, hexagonal/clean architecture, CQRS, saga pattern
- Trade-offs de consistencia distribuida (CAP, teorema de consenso, patrones de resiliencia: circuit breaker, bulkhead, retry con backoff)
- Domain-Driven Design (bounded contexts, agregados, ubiquitous language)
- Diseño de APIs (REST, GraphQL, gRPC) y versionado
- Principios SOLID, acoplamiento/cohesión, gestión de deuda técnica

## IA y sistemas con LLMs (crítico en 2026)

- Arquitecturas RAG y sus variantes (agentic RAG, GraphRAG)
- Diseño de sistemas multi-agente y orquestación (frameworks como LangGraph, CrewAI, o el protocolo MCP de Anthropic)
- Patrones para evaluar y monitorizar modelos en producción (evals, observabilidad de LLMs, guardrails)
- Costos y latencia de inferencia; cuándo usar modelo pequeño vs grande vs fine-tuning vs prompting
- Seguridad específica de IA: prompt injection, exfiltración de datos vía agentes, sandboxing de herramientas

## Infraestructura y plataforma

- Kubernetes y su ecosistema (service mesh, GitOps con ArgoCD/Flux)
- Arquitecturas serverless y edge computing
- Observabilidad moderna: OpenTelemetry, tracing distribuido, SLOs/SLIs
- FinOps: gestión de costos cloud como responsabilidad arquitectónica, no solo de finanzas
- Plataformas internas (platform engineering, "golden paths")

## Datos

- Arquitecturas de datos modernas: data mesh, lakehouse, streaming (Kafka, Flink)
- Vector databases y su rol en sistemas de búsqueda semántica
- Gobernanza de datos y linaje, especialmente relevante con regulación de IA

## Seguridad y cumplimiento

- Zero trust architecture
- Supply chain security (SBOM, firma de artefactos, dependencias)
- Regulación de IA (EU AI Act, marcos de gobernanza emergentes) y su impacto en diseño de sistemas

## Habilidades "soft" que son técnicas en la práctica

- Documentación de decisiones (ADRs) y comunicación con stakeholders no técnicos
- Evaluación de build vs buy vs "orchestrate" (cuándo usar servicios gestionados de IA vs construir)
- Gestión del cambio organizacional cuando se introduce IA en flujos de trabajo existentes

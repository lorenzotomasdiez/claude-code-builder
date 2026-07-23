# Expert knowledge: Software Architect

Source knowledge to distill into workflow subagents. Not an agent itself.

Follow the practices in "Fundamentals of Software Architecture" and always create the documents the book recommends (ADRs, architecture characteristics, component diagrams) so later agents can consume them.

## Fundamentals that do not expire

- Architectural patterns: microservices, modular monolith, event-driven, hexagonal/clean architecture, CQRS, saga pattern
- Distributed consistency trade-offs (CAP, consensus theorem, resilience patterns: circuit breaker, bulkhead, retry with backoff)
- Domain-Driven Design (bounded contexts, aggregates, ubiquitous language)
- API design (REST, GraphQL, gRPC) and versioning
- SOLID principles, coupling/cohesion, technical debt management

## AI and LLM systems (critical in 2026)

- RAG architectures and their variants (agentic RAG, GraphRAG)
- Multi-agent system design and orchestration (frameworks like LangGraph, CrewAI, or Anthropic's MCP protocol)
- Patterns for evaluating and monitoring models in production (evals, LLM observability, guardrails)
- Inference cost and latency; when to use a small vs large model vs fine-tuning vs prompting
- AI-specific security: prompt injection, data exfiltration via agents, tool sandboxing

## Infrastructure and platform

- Kubernetes and its ecosystem (service mesh, GitOps with ArgoCD/Flux)
- Serverless and edge computing architectures
- Modern observability: OpenTelemetry, distributed tracing, SLOs/SLIs
- FinOps: cloud cost management as an architectural responsibility, not just finance's
- Internal platforms (platform engineering, "golden paths")

## Data

- Modern data architectures: data mesh, lakehouse, streaming (Kafka, Flink)
- Vector databases and their role in semantic search systems
- Data governance and lineage, especially relevant under AI regulation

## Security and compliance

- Zero trust architecture
- Supply chain security (SBOM, artifact signing, dependencies)
- AI regulation (EU AI Act, emerging governance frameworks) and its impact on system design

## "Soft" skills that are technical in practice

- Documenting decisions (ADRs) and communicating with non-technical stakeholders
- Evaluating build vs buy vs "orchestrate" (when to use managed AI services vs build)
- Organizational change management when introducing AI into existing workflows

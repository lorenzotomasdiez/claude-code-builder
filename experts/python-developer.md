# Expert knowledge: Python Developer

Source knowledge to distill into workflow subagents. Not an agent itself.

## Language fundamentals (deep, not superficial)

- Object model, __slots__, descriptors, metaclasses, iterator/generator protocol
- asyncio in depth: event loop, tasks, asyncio.TaskGroup, structured concurrency, correct cancellation
- Advanced type hints: Generic, Protocol, TypeVar with bounds, ParamSpec, TypedDict, overload
- The GIL and its progressive removal (PEP 703, "free-threaded" builds since 3.13), real implications for concurrency
- Memory model: reference vs copy, gc, weak references, memory profiling (tracemalloc, memray)

## Performance and concurrency

- When to use threading vs multiprocessing vs asyncio vs subinterpreters (PEP 734)
- Native extensions: Cython, ctypes, cffi, PyO3/Rust bindings, knowing when to drop to Rust/C
- Real profiling: py-spy, austin, flame graphs, benchmarking with pyperf
- CPython's experimental JIT (3.13+) and its practical impact

## Architecture and system design

- API design (REST, gRPC, GraphQL) and trade-offs
- Architecture patterns: hexagonal, CQRS, event-driven, microservices vs modular monolith
- Public library/package design: semantic versioning, deprecation policies, backward compatibility
- Domain-Driven Design applied to Python (bounded contexts, aggregates)

## Testing and quality

- Advanced pytest: parametrized fixtures, custom plugins, hypothesis (property-based testing)
- Mutation testing (mutmut), contract testing, testing distributed systems
- Observability: OpenTelemetry, structured logging, distributed tracing

## Modern ecosystem tooling (2026)

- uv as the de facto standard for package/environment management (replacing pip/poetry in many teams)
- ruff as a unified linter/formatter (replaces flake8+black+isort)
- mypy/pyright in strict mode, CI integration
- Modern packaging: pyproject.toml, PEP 621, build backends (hatchling, modern setuptools)

## Infrastructure and deployment

- Optimized containers (multi-stage builds, distroless, image size)
- Kubernetes: operators, CRDs if the domain requires it
- CI/CD: GitHub Actions/GitLab CI, test matrices, dependency caching
- IaC: Terraform/Pulumi if the role requires it

## Data and ML (relevant in 2026 almost always)

- LLM integration: function calling, agents, RAG, embeddings, at the system architecture level, not just prompting
- polars as a mature alternative to pandas for large datasets
- Data pipelines: Airflow/Dagster, streaming (Kafka + Python consumers)

## Security

- OWASP applied to Python (insecure deserialization, SSRF, secrets management)
- Supply chain security: SBOM, package signing, dependency auditing (pip-audit)

## Senior-level skills (not purely technical)

- Designing RFCs/ADRs, cross-cutting technical leadership
- High-level mentoring and code review (not just style, but architecture)
- Ability to weigh business vs technical trade-offs and communicate them to non-technical stakeholders
- Defining engineering standards for the team/org

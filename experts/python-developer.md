# Expert knowledge: Python Developer

Source knowledge to distill into workflow subagents. Not an agent itself.

## Fundamentos del lenguaje (dominio profundo, no superficial)

- Modelo de objetos, __slots__, descriptores, metaclasses, protocolo de iteradores/generadores
- asyncio a fondo: event loop, tareas, asyncio.TaskGroup, structured concurrency, cancelación correcta
- Type hints avanzados: Generic, Protocol, TypeVar con bounds, ParamSpec, TypedDict, overload
- GIL y su eliminación progresiva (PEP 703, "free-threaded" builds desde 3.13), implicaciones reales en concurrencia
- Memory model: referencia vs copia, gc, weak references, profiling de memoria (tracemalloc, memray)

## Performance y concurrencia

- Cuándo usar threading vs multiprocessing vs asyncio vs subinterpreters (PEP 734)
- Extensiones nativas: Cython, ctypes, cffi, PyO3/Rust bindings, saber cuándo bajar a Rust/C
- Profiling real: py-spy, austin, flame graphs, benchmarking con pyperf
- JIT experimental de CPython (3.13+) y su impacto práctico

## Arquitectura y diseño de sistemas

- Diseño de APIs (REST, gRPC, GraphQL) y trade-offs
- Patrones de arquitectura: hexagonal, CQRS, event-driven, microservicios vs monolito modular
- Diseño de librerías/paquetes públicos: versionado semántico, deprecation policies, backward compatibility
- Domain-Driven Design aplicado a Python (bounded contexts, agregados)

## Testing y calidad

- pytest avanzado: fixtures parametrizadas, plugins propios, hypothesis (property-based testing)
- Mutation testing (mutmut), contract testing, testing de sistemas distribuidos
- Observabilidad: OpenTelemetry, structured logging, tracing distribuido

## Tooling moderno del ecosistema (2026)

- uv como estándar de facto para gestión de paquetes/entornos (reemplazando pip/poetry en muchos equipos)
- ruff como linter/formatter unificado (reemplaza flake8+black+isort)
- mypy/pyright en modo estricto, integración en CI
- Empaquetado moderno: pyproject.toml, PEP 621, build backends (hatchling, setuptools moderno)

## Infraestructura y despliegue

- Contenedores optimizados (multi-stage builds, distroless, tamaño de imagen)
- Kubernetes: operators, CRDs si aplica al dominio
- CI/CD: GitHub Actions/GitLab CI, matrices de testing, caching de dependencias
- IaC: Terraform/Pulumi si el rol lo requiere

## Datos y ML (relevante en 2026 casi siempre)

- Integración con LLMs: function calling, agentes, RAG, embeddings, a nivel de arquitectura de sistema, no solo prompting
- polars como alternativa madura a pandas para datasets grandes
- Pipelines de datos: Airflow/Dagster, streaming (Kafka + Python consumers)

## Seguridad

- OWASP aplicado a Python (deserialización insegura, SSRF, secrets management)
- Supply chain security: SBOM, firma de paquetes, auditoría de dependencias (pip-audit)

## Habilidades de nivel senior (no técnicas puras)

- Diseño de RFCs/ADRs, liderazgo técnico transversal
- Mentoría y code review de alto nivel (no solo estilo, sino arquitectura)
- Capacidad de evaluar trade-offs de negocio vs técnicos, y comunicarlos a stakeholders no técnicos
- Definición de estándares de ingeniería para el equipo/org

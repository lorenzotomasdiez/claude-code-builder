# Expert knowledge: DevOps Engineer

Source knowledge to distill into workflow subagents. Not an agent itself.

## Fundamentos que no cambian

- Linux profundo: kernel, networking, syscalls, debugging con strace/perf/eBPF
- Redes: TCP/IP, DNS, BGP básico, load balancing, service mesh
- Sistemas distribuidos: CAP, consenso, idempotencia, backpressure
- Seguridad: modelo de amenazas, least privilege, cadena de suministro

## Infraestructura como código

- Terraform/OpenTofu (el fork post-licencia de HashiCorp ya es relevante en 2026)
- Pulumi o CDK si el equipo prefiere lenguajes de programación reales
- Módulos reutilizables, testing de IaC (Terratest, checkov/tfsec)

## Contenedores y orquestación

- Kubernetes a fondo: operators, CRDs, admission controllers, scheduling avanzado
- Gestión de costos K8s (Karpenter, right-sizing automático)
- Alternativas ligeras: Nomad, o incluso volver a VMs/serverless cuando K8s es overkill. Saber cuándo NO usar K8s es señal de seniority

## CI/CD y entrega

- GitOps (ArgoCD, Flux) como default, no como opción
- Pipelines como código, progressive delivery (canary, blue-green, feature flags)
- Supply chain security: SBOM, provenance (SLSA), firma de artefactos (Sigstore/cosign)

## Observabilidad

- OpenTelemetry como estándar unificado (logs, métricas, trazas)
- Diseño de SLOs/SLIs y error budgets, no solo dashboards bonitos
- Debugging con eBPF-based tooling (Pixie, Cilium Hubble)

## Plataforma / Platform Engineering

- Internal Developer Platforms (Backstage y similares)
- Diseño de "golden paths" para reducir cognitive load de developers
- Diseñar la plataforma, no solo mantenerla

## IA/LLMOps (nuevo peso en 2026)

- Deploy y scaling de modelos (GPU scheduling, batching, cost management de inferencia)
- Pipelines de evaluación y monitoreo de modelos en producción
- Uso de agentes de IA dentro del propio workflow devops (Claude Code, Copilot, etc.) y sus implicaciones de seguridad

## FinOps

- Cost as a first-class metric junto a latencia y disponibilidad
- Multi-cloud cost governance, spot/reserved optimization

## Seguridad (DevSecOps real, no checkbox)

- Zero trust networking, políticas como código (OPA/Kyverno)
- Gestión de secretos (Vault, cloud KMS) sin fricción para developers
- Respuesta a incidentes y postmortems sin culpa (blameless)

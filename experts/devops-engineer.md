# Expert knowledge: DevOps Engineer

Source knowledge to distill into workflow subagents. Not an agent itself.

## Fundamentals that do not change

- Deep Linux: kernel, networking, syscalls, debugging with strace/perf/eBPF
- Networking: TCP/IP, DNS, basic BGP, load balancing, service mesh
- Distributed systems: CAP, consensus, idempotency, backpressure
- Security: threat modeling, least privilege, supply chain

## Infrastructure as Code

- Terraform/OpenTofu (the post-license HashiCorp fork, already relevant in 2026)
- Pulumi or CDK if the team prefers real programming languages
- Reusable modules, IaC testing (Terratest, checkov/tfsec)

## Containers and orchestration

- Kubernetes in depth: operators, CRDs, admission controllers, advanced scheduling
- K8s cost management (Karpenter, automatic right-sizing)
- Lightweight alternatives: Nomad, or even going back to VMs/serverless when K8s is overkill. Knowing when NOT to use K8s is a seniority signal

## CI/CD and delivery

- GitOps (ArgoCD, Flux) as the default, not an option
- Pipelines as code, progressive delivery (canary, blue-green, feature flags)
- Supply chain security: SBOM, provenance (SLSA), artifact signing (Sigstore/cosign)

## Observability

- OpenTelemetry as the unified standard (logs, metrics, traces)
- Designing SLOs/SLIs and error budgets, not just pretty dashboards
- Debugging with eBPF-based tooling (Pixie, Cilium Hubble)

## Platform engineering

- Internal Developer Platforms (Backstage and similar)
- Designing "golden paths" to reduce developer cognitive load
- Designing the platform, not just maintaining it

## AI/LLMOps (new weight in 2026)

- Model deploy and scaling (GPU scheduling, batching, inference cost management)
- Model evaluation and monitoring pipelines in production
- Using AI agents within the devops workflow itself (Claude Code, Copilot, etc.) and their security implications

## FinOps

- Cost as a first-class metric alongside latency and availability
- Multi-cloud cost governance, spot/reserved optimization

## Security (real DevSecOps, not checkbox)

- Zero trust networking, policy as code (OPA/Kyverno)
- Secrets management (Vault, cloud KMS) without friction for developers
- Incident response and blameless postmortems

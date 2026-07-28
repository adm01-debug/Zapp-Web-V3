# Inventário de Workflows CI

Inventário dos workflows GitHub Actions ativos em `.github/workflows/`.

## Workflows Principais

| Arquivo | Nome | Trigger | Propósito |
|---------|------|---------|----------|
| `ci.yml` | CI/CD Pipeline | push/PR main | Lint, types, testes, build |
| `deploy-vps.yml` | Build & Deploy | push main | Docker build + deploy Portainer |
| `ci-gate.yml` | CI Gate | push/PR | Gate de qualidade |
| `security.yml` | Security & Compliance | push | Audit deps, secrets scan |
| `gitleaks.yml` | Secret Scan | push | Detecta segredos expostos |
| `schema-drift.yml` | schema-drift-guard | push | Valida drift de schema |
| `security-invoker-gate.yml` | Security Invoker Gate | push/PR | Bloqueia views sem security_invoker |
| `quality-gate.yml` | Quality Gate | push/PR | TypeScript, ESLint |

## Workflows de Suporte

| Arquivo | Propósito |
|---------|----------|
| `codeql.yml` | Análise CodeQL de segurança |
| `branch-protection-sentinel.yml` | Protege branch main |
| `schema-snapshot.yml` | Snapshot semanal de schema |
| `gen-types-zapp.yml` | Regenera types Supabase |
| `ratchet-tighten.yml` | Tighten ESLint ratchet |
| `deno-contract-tests.yml` | Testes de contrato Edge Functions |

## Status Esperado no PR

Todos os checks abaixo devem estar verdes:
- CI Gate
- Security & Compliance
- Secret Scan (gitleaks)
- Quality Gate (TypeScript, ESLint)
- Security Invoker Gate

## Action Versions Canonicas

- `actions/checkout` → `@v4`
- `actions/upload-artifact` → `@v4`
- `actions/setup-node` → `@v4`
- `actions/cache` → `@v4`
- `oven-sh/setup-bun` → `@v2`
- `docker/setup-buildx-action` → `@v4`
- `docker/login-action` → `@v4`
- `docker/build-push-action` → `@v7`

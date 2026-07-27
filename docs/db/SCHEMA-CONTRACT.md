# SCHEMA CONTRACT

> **Contrato de dependências entre schemas — single source of truth**

---

## Dependency Graph

```
ai ──────► bpm ──────► zapp ──────────► evo
                           │
                           ├──► ops
                           ├──► financeiro
                           ├──► vendas
                           ├──► logistica
                           ├──► email_app
                           ├──► archive
                           └──► public (PostgREST API layer)
```

**Regra absoluta: `evo` NUNCA pode depender de `zapp`.**

---

## Per-Schema Contracts

### `zapp` — Application Core

- Proprietário: time de desenvolvimento zapp-web-v3
- Contém: entidades de negócio, views de API, matviews, functions
- Acesso: todas as roles autenticadas
- Depende de: `evo` (apenas views contratadas), `public`
- **Proíbe**: dependência direta em tabelas `evo`

### `evo` — Evolution API (WhatsApp)

- Proprietário: time de infraestrutura
- Contém: mensagens, conversas, contatos, webhooks (Evolution API v2.3.7)
- Acesso: service_role, evo_service
- Depende de: `zapp` (views contratadas via `zapp.vw_evo_*`)
- **Proíbe**: FKs para `zapp`, views `zapp.*` dentro de `evo`

### `public` — PostgREST API Facade

- Proprietário: time de APIs
- Contém: 539 views de compatibilidade (PostgREST expõe public → zapp)
- Acesso: anon (GET), authenticated (mutations via RPC)
- Depende de: `zapp`, `evo`
- security_invoker: ON em todas as views
- **Proíbe**: tabelas base neste schema (exceto tracking)

### `ops` — Operações e Observabilidade

- Proprietário: time de SRE/DBA
- Contém: health checks, alertas, runbooks, governance, snapshots
- Acesso: service_role apenas
- Depende de: todos os schemas (leitura)
- **Proíbe**: qualquer write em schemas de negócio

### `bpm` — Business Process Management

- Proprietário: time de processos
- Contém: processos, instâncias, variáveis, tarefas
- Acesso: authenticated + bpm_admin
- Depende de: `zapp`

### `financeiro` — Módulo Financeiro

- Proprietário: time financeiro
- Contém: contas a pagar/receber, transações, colaboradores
- Acesso: authenticated + financeiro_admin
- Depende de: `zapp`

### `vendas` — Módulo de Vendas

- Proprietário: time comercial
- Contém: oportunidades, propostas, pipeline
- Acesso: authenticated + vendas_admin
- Depende de: `zapp`

### `logistica` — Módulo de Logística

- Proprietário: time de logística
- Contém: entregas, rastreamento, transportadoras
- Acesso: authenticated + logistica_admin
- Depende de: `zapp`

### `email_app` — Módulo de E-mail

- Proprietário: time de infraestrutura
- Contém: templates, campanhas, eventos de tracking
- Acesso: service_role
- Depende de: `zapp`

### `ai` — Módulo de Inteligência Artificial

- Proprietário: time de IA
- Contém: modelos, sessões, embeddings, tooling
- Acesso: service_role + ai_service
- Depende de: `zapp`, `bpm`

### `archive` — Dados Históricos

- Proprietário: time de compliance
- Contém: dados arquivados com retenção
- Acesso: service_role + archive_admin
- Depende de: `zapp` (read-only)

---

## Storage Buckets

| Bucket | Visibility | PII | Contrato |
|--------|-----------|-----|----------|
| whatsapp-media | public (⚠️ private required) | YES | evo/zapp |
| recibos-entrega | public (⚠️ private required) | YES | logistica |
| avatars | private | NO | zapp |
| chat-attachments | private | YES | zapp |
| invoice-pdfs | private | YES | financeiro |
| ai-models | private | NO | ai |

---

## CI Checks (executar em pipeline)

```sql
-- CI-01: Proibir FKs evo → zapp
SELECT * FROM ops.fn_ci_check_forbidden_fks()
  WHERE status = 'VIOLATION';

-- CI-02: Verificar versionamento de migrations
SELECT * FROM ops.fn_ci_check_migration_versions();

-- CI-03: Verificar duplicatas de migration
SELECT * FROM ops.fn_ci_check_migration_duplicates();

-- CI-04: Verificar RLS coverage
SELECT * FROM ops.fn_ci_check_rls_coverage();

-- CI-05: Verificar nomes de views em backcompat
SELECT * FROM ops.v_backcompat_view_coverage;
```

---

## Revisão de contrato

Este documento deve ser revisado a cada nova ADR que altere estrutura de schemas.
 owners: @dev-zapp, @infra-team

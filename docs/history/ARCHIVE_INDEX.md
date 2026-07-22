# Histórico de Documentação — ZAPP web v3

Este diretório (`docs/history/`) é o lar canônico de todos os documentos
gerados por rodadas de automação, QA, simulações e planejamento de migração.

> **Regra para agentes e devs**: se você for criar um arquivo com prefixo
> `ROUND-`, `MIGRATION-`, `QA_REPORT_`, `EXECUTION-`, `DEPLOYMENT-READINESS-`,
> `EXHAUSTIVE_`, `SMOKE-TESTS-`, ou qualquer relatório histórico,
> **crie em `docs/history/`, não na raiz**.

---

## Documentos históricos (ainda na raiz — a mover)

Os arquivos abaixo estão temporariamente na raiz até uma migração via `git mv`.
Este índice serve como referência de navegação.

### Rodadas de desenvolvimento

| Arquivo | Descrição |
|---------|-----------|
| `ROUND-15-COMPLETE-EXECUTION-GUIDE.md` | Guia completo da Round 15 |
| `ROUND-15-COMPLETION-REPORT.md` | Relatório de conclusão da Round 15 |
| `ROUND-15-EXECUTION-STATUS.md` | Status de execução da Round 15 |
| `ROUND-15-STAGING-DEPLOYMENT.md` | Deploy staging da Round 15 |
| `ROUND-17-POST-DEPLOYMENT-VERIFICATION.md` | Verificação pós-deploy Round 17 |
| `ROUND-15-EXHAUSTIVE-TEST-SUITE.sql` | Suite SQL de testes Round 15 |
| `SMOKE-TESTS-ROUND15.sql` | Smoke tests Round 15 |

### Planos de migração

| Arquivo | Descrição |
|---------|-----------|
| `MIGRATION-EXECUTION-PLAN.md` | Plano mestre de execução de migrações |
| `MIGRATION-0-EXECUTION-READY.md` | Migração 0 — pronta para execução |
| `MIGRATION-1-EXECUTION-READY.md` | Migração 1 — pronta para execução |
| `MIGRATION-2-EXECUTION-READY.md` | Migração 2 — pronta para execução |
| `MIGRATION-3-EXECUTION-READY.md` | Migração 3 — pronta para execução |
| `MIGRATION-4-EXECUTION-READY.md` | Migração 4 — pronta para execução |
| `MIGRATION-5-EXECUTION-READY.md` | Migração 5 — pronta para execução |

### Relatórios de QA e validação

| Arquivo | Descrição |
|---------|-----------|
| `QA_REPORT_2026-06-14.md` | QA report de 14/06/2026 |
| `QA_REPORT_2026-07-11.md` | QA report de 11/07/2026 |
| `EXHAUSTIVE_VALIDATION_REPORT.md` | Relatório de validação exaustiva |
| `EXECUTION-SIMULATION-500-SCENARIOS.md` | Simulação de 500 cenários |
| `FALHAS_E_GAPS.md` | Falhas e gaps identificados |
| `FINAL_CHECKLIST.txt` | Checklist final de verificação |

### Deploy e infraestrutura (histórico)

| Arquivo | Descrição |
|---------|-----------|
| `DEPLOYMENT-READINESS-CERTIFICATE.md` | Certificado de prontidão para deploy |
| `DEPLOYMENT_EXECUTION_STATUS.md` | Status de execução de deploy |
| `DEPLOYMENT_GUIDE.md` | Guia de deploy (versão histórica) |
| `DEPLOY_PRODUCAO.md` | Deploy para produção (histórico) |
| `PRODUCTION_EXCELLENCE_IMPLEMENTATION.md` | Implementação de excelência em produção |
| `PERFORMANCE-SLA-VALIDATION.md` | Validação de SLA e performance |
| `RUNTIME-RLS-VALIDATION.md` | Validação de RLS em runtime |
| `SCHEMA-INTROSPECTION-PROTECTION.md` | Proteção de introspecção de schema |
| `ENCRYPTION-KEY-ROTATION-WORKFLOW.md` | Workflow de rotação de chaves |

### Implementação e refatoração

| Arquivo | Descrição |
|---------|-----------|
| `IMPLEMENTATION_SUMMARY.txt` | Resumo de implementação |
| `REFACTORING.md` | Documento de refatoração |
| `deploy-round15-staging.sh` | Script de deploy staging Round 15 |

### Assets de desenvolvimento

| Arquivo | Descrição |
|---------|-----------|
| `design-system-audit.html` | Auditoria do design system (HTML) |
| `design-system-audit.md` | Auditoria do design system (MD) |
| `test-dompurify.mjs` | Teste de DOMPurify |

---

## O que FICA na raiz

| Arquivo/Dir | Motivo |
|-------------|--------|
| `README.md` | Entrada do projeto |
| `CLAUDE.md` | Contexto para agentes de IA |
| `DATABASE_SCHEMA_RULES.md` | Regras críticas de BD (referenciado por agentes) |
| `CHANGELOG.md` | Histórico de versões |
| `DEPLOYMENT.md` | Runbook de deploy **canônico** (único) |
| `SECURITY.md` | Política de segurança |
| `CODE_REVIEW.md` | Padrões de revisão de código |
| `TESTING_CONVENTION.md` | Convenções de teste |
| `LEVANTA_FUNCIONALIDADES.md` | Levantamento de funcionalidades |
| `INFRA.md` | Documentação de infraestrutura |
| `Dockerfile`, `nginx*.conf` | Infra/build |
| `docker-compose.yml` | Dev environment |
| Configs (`*.json`, `*.config.*`, `.*rc*`) | Ferramentas |
| `package.json`, `bun.lock`, `tsconfig*` | Dependências e build |
| `vercel.json`, `vite.config.ts` | Deploy e bundler |
| `.github/`, `src/`, `supabase/`, `public/` | Código-fonte |

---

_Última atualização: 2026-07-22 — Agente de qualidade de processo_

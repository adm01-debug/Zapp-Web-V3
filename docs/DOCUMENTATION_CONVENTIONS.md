# Convenções de Documentação — ZAPP web v3

Este documento define onde cada tipo de arquivo deve viver no repositório.
É a referência canônica para agentes de IA e desenvolvedores.

---

## Raiz do repositório — o que fica aqui

Apenas estes tipos de arquivo pertencem à raiz:

| Tipo | Exemplos |
|------|---------|
| Instruções de projeto | `README.md`, `CLAUDE.md` |
| Versionamento | `CHANGELOG.md` |
| Deploy canônico (único!) | `DEPLOYMENT.md` |
| Segurança | `SECURITY.md` |
| Regras críticas de BD | `DATABASE_SCHEMA_RULES.md` |
| Convenções de código | `CODE_REVIEW.md`, `TESTING_CONVENTION.md`, `LEVANTA_FUNCIONALIDADES.md`, `INFRA.md` |
| Configs de ferramentas | `*.json`, `*.config.*`, `.*rc*`, `Dockerfile`, `docker-compose.yml`, `nginx*.conf` |
| Manifesto de pacotes | `package.json`, `bun.lock`, `tsconfig*`, `deno.json`, `components.json`, `vercel.json` |
| Workflows e agentes | `.github/`, `.lovable/`, `.agents/` |
| Código-fonte | `src/`, `supabase/`, `public/`, `scripts/` |

---

## Raiz do repositório — o que NUNCA fica aqui

**Nunca criar estes tipos de arquivo na raiz.** Usar sempre `docs/history/`:

| Padrão de nome | Destino correto |
|----------------|----------------|
| `ROUND-N-*` | `docs/history/` |
| `MIGRATION-N-EXECUTION-READY.md` | `docs/history/` |
| `MIGRATION-EXECUTION-PLAN.md` | `docs/history/` |
| `QA_REPORT_*.md` | `docs/history/` |
| `EXECUTION-SIMULATION-*.md` | `docs/history/` |
| `DEPLOYMENT_*_STATUS.md` | `docs/history/` |
| `DEPLOYMENT-READINESS-*.md` | `docs/history/` |
| `EXHAUSTIVE_VALIDATION_REPORT.md` | `docs/history/` |
| `FALHAS_E_GAPS.md` | `docs/history/` |
| `FINAL_CHECKLIST.*` | `docs/history/` |
| `IMPLEMENTATION_SUMMARY.*` | `docs/history/` |
| `PERFORMANCE-SLA-VALIDATION.md` | `docs/history/` |
| `PRODUCTION_EXCELLENCE_*.md` | `docs/history/` |
| `RUNTIME-RLS-VALIDATION.md` | `docs/history/` |
| `deploy-round*.sh` | `docs/history/` |
| `SMOKE-TESTS-*.sql` | `docs/history/` |

> **Regra de ouro**: Se o arquivo documenta o que **aconteceu** em uma rodada específica, vai em `docs/history/`. Se documenta **como o sistema funciona** agora, pode ficar em `docs/` ou na raiz.

---

## Estrutura de `docs/`

```
docs/
├── history/                    # Arquivos históricos e de rodadas
│   └── ARCHIVE_INDEX.md        # Índice dos arquivos históricos
├── DOCUMENTATION_CONVENTIONS.md  # Este arquivo
├── SCHEMA_REFERENCE.md         # Schemas e tabelas (canônico)
├── ER_DIAGRAM.md               # Diagrama entidade-relacionamento
├── ARCHITECTURE_AND_FLOW.md    # Arquitetura e fluxo de dados
├── API_CONTRACT.md             # Contratos de API
├── EVOLUTION_API_REFERENCE.md  # API WhatsApp
└── RUNBOOK_OBSERVABILITY.md    # Observabilidade e alertas
```

---

## Convenção para MÚLTIPLOS arquivos DEPLOYMENT.md

Se você for criar um novo guia de deploy:
1. **Verifique** se já existe um `DEPLOYMENT.md` na raiz
2. Se existir: **edite o existente** em vez de criar novo
3. Se precisar arquivar a versão anterior: `git mv DEPLOYMENT.md docs/history/DEPLOYMENT-YYYY-MM-DD.md`
4. Só então crie o novo `DEPLOYMENT.md` na raiz

---

## Aplicando a regra em sessões de agentes

Antes de criar qualquer arquivo de documentação, pergunte:
- É uma **instrução permanente** do sistema? → raiz ou `docs/`
- É o **resultado de uma rodada** específica de trabalho? → `docs/history/`

_Última atualização: 2026-07-22_

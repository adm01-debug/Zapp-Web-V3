# INVENTÁRIO DE INFRAESTRUTURA — AtomicaBR (v0.2)

> **Status:** RASCUNHO → v0.2 — contagens AO VIVO pós-waves 1–2 (snapshot 2026-08-06 ~20:20 BRT) + seção MCPs atualizada (item 96).
> **Origem:** item 93 da Auditoria de 100 Etapas; v0.1 = AG-EX-10 (15:20); re-baseline = AG-EX-20 (19:00); **v0.2 = AG-EX-24 (20:20)**. Preenchimento linha-a-linha continua nas próximas ondas.
> **Regras:** READ-ONLY; sem segredos (apenas nomes de chaves/endpoints; valores mascarados). Manter versionado no repo (`.hermes/auditoria-infra/` até migrar para `infra/`).

---

## 1. Contagens AO VIVO (snapshot 06/08/2026 ~20:20 BRT — pós-waves 1–2)

Fonte: Portainer MCP (endpoint 1) + `docker` CLI via `docker-housekeeping_cleanup` + Supabase MCP (PG15.8) + volume edge-runtime.

| Métrica | **v0.2 (20:20)** | v0.1 (15:20) | Δ desde v0.1 | Baseline 100 etapas | Δ vs baseline | Método |
|---|---|---|---|---|---|---|
| Stacks (Portainer) | **72** | 73 | −1 | 74 | −2 | `portainer_list_stacks` (ids 19–220; 168/211 removidos, 219/220 novos) |
| Services (Swarm) | **97** | 94 | +3 | — | — | `docker service ls -q \| wc -l` |
| Containers totais | **96** | 91 | +5 | 97 | −1 | `docker ps -aq \| wc -l` |
| Containers running | **92** | 89 | +3 | 89 | +3 | `docker ps -q \| wc -l` |
| Containers exited | **4** | 2 | +2 | 8 | −4 | (restore-validate 0, n8n-keyfix 0, evolution-db-purge ×2 137) |
| Imagens | **70** | 69 | +1 | 69 | +1 | `docker images -q \| wc -l` |
| Volumes | **36** | 39 | −3 | 49 | −13 | `docker volume ls -q \| wc -l` |
| Volumes dangling | **0** | 0 | = | 5 | −5 | `docker volume ls -f dangling=true` |
| Cron jobs (pg_cron) | **155** (130 ativos + 25 inativos) | 155 (130/25) | = | 151 ativos (1 inat) | ativos −21 | `SELECT count(*) FROM cron.job` |
| Guards/watchdogs/monitors (serviços) | **20** | 21 | −1 | 27 | −7 | grep `guard\|watchdog\|monitor\|cleanup\|reconcile` |
| Edge functions | **107** (106 + `_shared`) | 121 | **−14** 🎯 | ~120 | −13 | `ls /home/deno/functions \| wc -l` no edge-runtime |
| Views schema `public` | **444** | 477 | **−33** 🎯 | 477 | −33 | `pg_views WHERE schemaname='public'` |
| Policies RLS (total) | **1.376** | 1.372 | +4 | 1.373 | +3 | `SELECT count(*) FROM pg_policies` |
| Policies `USING(true)` | **0** ✅ | 0 | = | 741 | −741 | `pg_policies WHERE lower(qual) LIKE '%using (true)%'` |
| Secrets Swarm | **54** | 54 | = | 58 | −4 | `docker secret ls` |
| Stacks `updated:1970` | **7** | 9 | **−2** | 9 | −2 | clamav 130, disk-actioner 207, disk-deep-clean 208, evolution-reconcile 212, dlq-alert-guard 213, postgres-backup-n8n-daily 215, postgres-backup-apps-daily 219 |
| MCPs registrados (Hermes default) | **8** | 8 | = | — | — | `config.yaml → mcp_servers` (ver §4; proposta de dedup no PROPOSTA-MCP-RACIONALIZACAO.md) |
| Backups novos (wave 2) | **+4 stacks** | — | +4 | — | — | 215 n8n-daily, 216 restore-validate ✅, 219 apps-daily (metabase+typebot), 220 volume-backup (rabbitmq/evolution/redis) |

**Swarm:** 1 nó manager · Docker 28.1.1 · Portainer 2.39.5 · Host Ubuntu 20.04.6, 12 vCPU / 25,2 GB RAM.
**Bancos:** Supabase PG **15.8.1.085** (schemas-chave: zapp 323t/347v→444v public? conferir, evo 133t, public 4t) · PG14 nativo 14.22 (evolution, n8n_queue, metabase, typebot).
**Nota crons:** total 155 = 130 ativos + 25 inativos (consolidação AG-EX-02; métrica de progresso = ativos).

---

## 2. Template de linha (preencher nas próximas ondas)

Para cada stack/serviço (uma linha por stack; serviços notáveis como linhas filhas):

```markdown
| <nome stack> | <id> | <dono/área> | <propósito (1 frase)> | <critical|important|disposable> | <dependências: banco, redis, rmq, traefik, secrets, volumes> | <notas/AG-EX> |
```

Exemplo preenchido (stack evolution):

```markdown
| evolution | 25 | Joaquim (Tec) | Evolution API custom 2.3.7 (fork com patches T1–T6) — WhatsApp wpp2 | critical | postgres(PG14 evolution), redis, rabbitmq, secrets (evolution_api_key_v5, x-webhook-secret…), volume evolution_instances | pin digest 9d110bc7; CORS_ORIGIN=* (F2-07b); AG-EX-10 item 91/97 |
```

Campos obrigatórios: **nome · dono · propósito · criticidade · dependências**. Opcional: SLA/RTO/RPO, agendamento (cron), tags.

---

## 3. Stacks (72) — tabela a preencher

> Lista completa no Portainer (`portainer_list_stacks`, ids 19–220). Sinalizados os que exigem atenção.

| Stack | Id | Criado | Flag | Observação |
|---|---|---|---|---|
| postgres | 20 | 2024-12-10 | 🟡 | PG14 nativo — EOL 12/11/2026 (AG-EX-08) |
| evolution | 25 | 2024-12-10 | 🟡 | CORS `*`; drift de imagem 3-vias (AG-EX-10) |
| supabase | 35 | 2024-12-12 | 🟡 | 444 views public; 155 crons (130 ativos) |
| clamav | 130 | 2026-05-06 | 🔴 `1970` | deploy via CLI; rodando healthy (AG-EX-04) |
| disk-actioner | 207 | 2026-08-01 | 🔴 `1970` | via CLI |
| disk-deep-clean | 208 | 2026-08-01 | 🔴 `1970` | via CLI |
| evolution-reconcile | 212 | 2026-08-05 | 🔴 `1970` | via CLI |
| dlq-alert-guard | 213 | 2026-08-05 | 🔴 `1970` | via CLI |
| postgres-backup-n8n-daily | 215 | 2026-08-06 | 🔴 `1970` | n8n_queue ganhou backup (AG-EX-08) |
| postgres-backup-apps-daily | 219 | 2026-08-06 | 🔴 `1970` | **novo wave 2**: metabase + typebot (fecha gaps do Anexo A/66) |
| github-actions-runner | 210 | 2026-08-01 | 🟢 | runner CI self-hosted (item 92) |
| restore-validate | 216 | 2026-08-06 | 🟢 | restore end-to-end validado 06/08 ✅ (AG-EX-08) |
| volume-backup | 220 | 2026-08-06 | 🟢 | **novo wave 2**: rabbitmq-data, evolution-instances, redis-data |
| deptopessoal | 182 | 2026-07-21 | 🔴 **DOWN 0/1 ~12d** | MCP Supabase cloud p/ RH; crash disco cheio; ver PROPOSTA-MCP |
| vscode-mcp | 171 | 2026-07-14 | 🟡 mcp-server 0/1 | só code-server up |
| … demais 57 stacks | … | … | — | preencher nas próximas ondas |

> **7 stacks `updated:1970`** = criados/deployados via CLI/API fora do fluxo UI do Portainer → drift de configuração latente (AG-EX-10 item 92; meta zero — item 92).

---

## 4. MCPs registrados (item 96 — AG-EX-24)

### 4.1 Hermes — mapa completo de registros (24 registros / 14 servidores)

| Nome (config) | Endpoint (mascarado) | Tipo | default | otimizado | coder | planner |
|---|---|---|---|---|---|---|
| supabase | `supabase-mcp.atomicabr.com.br/s-a501…db80/mcp` (path token; **self-hosted**) | self-hosted | ✅ | ✅ | — | — |
| portainer | `portainer-mcp.atomicabr.com.br/mcp` | self-hosted | ✅ | ✅ | — | — |
| evolution | `evolution-mcp.adm01.workers.dev/mcp` | CF Worker | ✅ | ✅ | — | — |
| github | `github-mcp-server.adm01.workers.dev/mcp` | CF Worker | ✅ | ✅ | — | — |
| brightdata | `mcp.brightdata.com/mcp?token=…` (⚠️ query string) | SaaS | ✅ | ✅ | — | — |
| jina | `jina-mcp.adm01.workers.dev/mcp` | CF Worker | ✅ | ✅ | — | — |
| chrome | `chrome-browser-mcp-server.adm01.workers.dev/mcp` | CF Worker | ✅ | ✅ | — | — |
| context7 | `mcp.context7.com/mcp` (header `MCP_CONTEXT7_API_KEY`) | SaaS | ✅ | ✅ | — | — |
| lovable | `lovable-mcp-server.adm01.workers.dev/mcp` | CF Worker | — | ✅ | — | — |
| cloudflare-deploy | `cloudflare-deploy-mcp.adm01.workers.dev/mcp` | CF Worker | — | ✅ | — | — |
| sentry-cloud | `mcp.sentry.dev/mcp/promobrindes` (Bearer mascarado) | SaaS | — | ✅ | — | — |
| graphify | `python …/scripts/graphify_mcp_server.py` (stdio local) | local | — | ✅ | — | — |
| github (npx) | stdio `@modelcontextprotocol/server-github` (token **vazio**) | local | — | — | ✅ | ✅ |
| claude-code | `claude-code-mcp.adm01.workers.dev/mcp` | CF Worker | — | — | ✅ | ✅ |

> **Proposta de dedup (dono decide):** default 6 (supabase, portainer, evolution, github, context7, chrome) · otimizado 10 (supabase, portainer, evolution, github, brightdata, jina, lovable, cloudflare-deploy, graphify, sentry-cloud) · coder 2 · planner 1–2. Detalhes, risco por consumidor e ordem de migração: **PROPOSTA-MCP-RACIONALIZACAO.md**.

### 4.2 Servidores MCP no Swarm (containers — status ao vivo 06/08 20:15)

| Serviço | Endpoint | Porta interna | Replicas | Projeto de banco | Credencial | Tier |
|---|---|---|---|---|---|---|
| portainer-mcp-v2 | `portainer-mcp.atomicabr.com.br` | 3000 | 1/1 healthy | — | env | critical |
| supabase-db-mcp | `supabase-mcp.atomicabr.com.br` (path token) | 3100 | 1/1 healthy | **self-hosted** PG15.8 | `secret supabase_db_url_v1` ✅ | important |
| supabase-artes-mcp | `…/artes-mcp` | 3001 | 1/1 healthy | **cloud** `pnpwqtkczlkdjptjlwyt` | ⚠️ literais no compose | important |
| supabase-pttz-mcp | `…/pttz-mcp` (Bearer + `/.well-known/oauth`) | 8787 | 1/1 healthy | **cloud** `pttzwlbidamibjssqiqb` | ⚠️ literais no compose | important |
| deptopessoal | `…/deptopessoal` (CORS claude.ai/lovable) | 3100 | **0/1 DOWN ~12d** | **cloud** `frjbfeamybqsejlvmqbl` | ⚠️ literais no compose | critical |
| vscode-mcp (mcp-server) | `mcp.atomicabr.com.br` | 7337 | **0/1** (code-server 1/1) | — | — | important |
| mcp-health-monitor | interno | — | 1/1 | — | secrets | critical |
| claude-code | (backend worker) | — | 1/1 | — | — | important |

> **Correção AG-EX-10/20:** os 4 servidores do host `supabase-mcp` **não** apontam ao mesmo banco — 1 self-hosted + 3 projetos cloud distintos. Roteamento por path (Traefik stripprefix) já é o padrão correto. Pendências: credenciais literais → secrets (P1), rotação, órfãos (deptopessoal, vscode-mcp-server), auth do db-mcp (initialize sem token → 200), brightdata token → header.

### 4.3 Liveness (probe `initialize`, 06/08 20:15)

| Endpoint | HTTP | |
|---|---|---|
| 7 workers CF (`*.adm01.workers.dev/mcp`) | 200 | ✅ todos operacionais |
| `supabase-mcp…/s-a501…db80/mcp` · `…/mcp` | 200 | db-mcp OK; ⚠️ raiz sem token responde |
| `…/pttz-mcp/mcp` | 401 | ✅ Bearer exigido |
| `…/artes-mcp/mcp` | 404 | servidor ativo; endpoint não em `/mcp` |
| `…/deptopessoal/mcp` | 200 | fallthrough p/ db-mcp (serviço down) ⚠️ |
| `portainer-mcp…` · `mcp.context7.com` | 200 | OK |
| `mcp.sentry.dev/mcp/promobrindes` | 401 | esperado sem header |

---

## 5. Metas de simplificação (item 99 — baseline AG-EX-10/20 vs v0.2)

| Métrica | Alvo | Baseline (15:20) | Re-baseline AG-EX-20 (19:00) | **v0.2 (20:20)** | Status |
|---|---|---|---|---|---|
| Crons ativos | <60 | 151 | 130 | **130** (155 total; 25 inativos) | 🔴 (consolidação em curso; −21) |
| Guards/watchdogs/monitors | <10 | 27 | 21 | **20** | 🟡 |
| Edge functions | <70 | 121 | 121 | **107** (106+`_shared`) | 🔴 (−14 🎯) |
| Views public | <150 | 477 | 477 | **444** | 🔴 (−33 🎯) |
| Policies USING(true) | 0 | 0 | 0 | **0** ✅ | ✅ |

> Waves 1–2 entregaram: edge fns **−14**, views **−33**, crons ativos estáveis em 130, guards **−1**. Próximo re-baseline: 06/11/2026 (item 100).

---

## 6. Crons (155 — 130 ativos) — pendente de preenchimento

> Inventário linha-a-linha (dono, propósito, SLA) = item 40. Meta: **ativos → <60** (item 99); 25 inativos = progresso da consolidação AG-EX-02. Validação contra `cron.job_run_details` (falhas 7d) e `cron-guardian` (180).

## 7. Edge functions (107 — 106 + `_shared`) — pendente de preenchimento

> Lista completa no volume edge-runtime (`/home/deno/functions`). Classificação ativa/dormente/duplicada = item 71. Meta: **107 → <70** (item 99). Waves 1–2 removeram 14 (testes/diagnóstico).

---

## 8. Como atualizar este inventário

1. Contagens: reexecutar os comandos da §1 (ou `snapshot-sprawl.sh` proposto no AG-EX-10, item 100 — atualizar grep de guards e contagem de stacks nele).
2. Linhas de stack: preencher por bloco de consolidação, usando o template da §2.
3. Nunca incluir valores de secrets — apenas nomes (fingerprints) e referências.
4. Registrar data + responsável em cada atualização (`YYYY-MM-DD | autor | Δ`).
5. Mudanças de MCPs: atualizar §4 e refletir no `mcp-health-monitor` e na política de novos MCPs (PROPOSTA-MCP-RACIONALIZACAO.md §Eixo C).

---

*Gerado por AG-EX-24 (item 96 + 93/99) — 2026-08-06. Read-only; nenhum segredo incluído. v0.1 = AG-EX-10, re-baseline = AG-EX-20, v0.2 = AG-EX-24.*


## Separação de infraestrutura (2026-08-12)

Serviços Evolution extraídos para repo separado [adm01-debug/evolution-stack](https://github.com/adm01-debug/evolution-stack):
- Stack 25 (Evolution API), Stack 113 (consumer RabbitMQ), Stack 126 (purge)
- Stacks 225, 230, 234, 236 (watchdogs/observers)
- Imagens GHCR: `evolution-stack/evolution-api-custom`, `evolution-stack/evolution-rabbit-consumer`

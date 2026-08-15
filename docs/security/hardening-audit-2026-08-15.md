# Auditoria de Hardening Docker Swarm
**Data:** 2026-08-15 · **Cluster:** AtomicaBR VPS · **Total de serviços:** 146

## Resumo executivo

| Categoria | Qtd | % |
|-----------|----:|--:|
| ✅ NNP + CapDrop (hardening completo) | 66 | 45% |
| 🟡 NNP apenas (sem CapDrop) | 28 | 19% |
| 🟠 CapDrop apenas (NNP revertido por CI) | 5 | 3% |
| ❌ Sem hardening | 47 | 32% |
| **Total** | **146** | **100%** |

### ReadOnly=true (hardening adicional)
Serviços com filesystem read-only: `evolution_evolution`, `obs-loki_loki`, `obs-prometheus_prometheus`

---

## NNP + CapDrop (66 serviços)

| Serviço | NNP | CapDrop | ReadOnly | Obs |
|---------|:---:|:-------:|:--------:|-----|
| `analytics-refresh_refresh` | ✅ | ALL |  |  |
| `deptopessoal_deptopessoal` | ✅ | ALL |  |  |
| `disk-actioner_actioner` | ✅ | ALL |  |  |
| `disk-deep-clean_deep-clean` | ✅ | ALL |  |  |
| `disk-monitor_monitor` | ✅ | ALL |  |  |
| `dlq-ops_alert-guard` | ✅ | ALL |  |  |
| `dlq-ops_inspector` | ✅ | ALL |  |  |
| `docker-housekeeping_cleanup` | ✅ | ALL |  |  |
| `evolution-db-purge_purge` | ✅ | ALL |  |  |
| `evolution-pgbackrest-backup_backup` | ✅ | ALL |  |  |
| `evolution-rabbit-consumer_consumer` | ✅ | ALL |  |  |
| `evolution-watchdogs_portainer-drift-check` | ✅ | ALL |  |  |
| `evolution_evolution` | ✅ | ALL | ✅ |  |
| `gmaps_scraper` | ✅ | ALL |  |  |
| `hermes-guard_guard` | ✅ | ALL |  |  |
| `infra-boot-guard_boot-guard` | ✅ | ALL |  |  |
| `metabase-watchdog_metabase-watchdog` | ✅ | ALL |  |  |
| `minio_minio` | ✅ | ALL |  |  |
| `n8n_n8n_editor` | ✅ | seletivo-13 |  |  |
| `n8n_n8n_webhook` | ✅ | seletivo-12 |  |  |
| `n8n_n8n_worker` | ✅ | seletivo-13 |  |  |
| `obs-loki_loki` | ✅ | ALL | ✅ |  |
| `obs-prometheus_prometheus` | ✅ | ALL | ✅ |  |
| `om-sintetico` | ✅ | ALL |  |  |
| `openmetadata-watchdog_openmetadata-watchdog` | ✅ | ALL |  |  |
| `portainer-mcp-v2_portainer-mcp` | ✅ | ALL |  |  |
| `portainer_agent` | ✅ | ALL |  |  |
| `portainer_portainer` | ✅ | ALL |  |  |
| `postgres-backup-apps-daily_backup-metabase` | ✅ | ALL |  |  |
| `postgres-backup-apps-daily_backup-typebot` | ✅ | ALL |  |  |
| `postgres-backup-daily_backup-daily` | ✅ | ALL |  |  |
| `postgres-backup-monthly_backup-monthly` | ✅ | ALL |  |  |
| `postgres-backup-n8n-daily_backup-n8n-daily` | ✅ | ALL |  |  |
| `postgres-backup-weekly_backup-weekly` | ✅ | ALL |  |  |
| `rabbitmq_rabbitmq` | ✅ | seletivo-12 |  |  |
| `reconcile-ops_guardrail` | ✅ | ALL |  |  |
| `redis-health-watchdog_redis-watchdog` | ✅ | ALL |  |  |
| `redis_redis` | ✅ | seletivo-12 |  |  |
| `scanopy-discovery-cron_discovery-cron` | ✅ | ALL |  |  |
| `scanopy-ops_probe` | ✅ | ALL |  |  |
| `scanopy-pgdump_pgdump` | ✅ | ALL |  |  |
| `scanopy-snapshot_snapshot-cron` | ✅ | ALL |  |  |
| `schema-drift-guard_guard` | ✅ | ALL |  |  |
| `supabase-artes-mcp_supabase-artes-mcp` | ✅ | ALL |  |  |
| `supabase-backup_backup` | ✅ | ALL |  |  |
| `supabase-config-backup_config-backup` | ✅ | ALL |  |  |
| `supabase-db-mcp_supabase-db-mcp` | ✅ | ALL |  |  |
| `supabase-pttz-mcp_supabase-pttz-mcp` | ✅ | ALL |  |  |
| `supabase_auth` | ✅ | ALL |  |  |
| `supabase_db` | ✅ | seletivo-12 |  |  |
| `supabase_functions` | ✅ | ALL |  |  |
| `supabase_kong` | ✅ | ALL |  |  |
| `supabase_rest` | ✅ | ALL |  |  |
| `swarm-task-guardian_swarm-task-guardian` | ✅ | ALL |  |  |
| `traefik-ops_cert-backup` | ✅ | ALL |  |  |
| `traefik-ops_cert-guard` | ✅ | ALL |  |  |
| `traefik-ops_collector-401` | ✅ | ALL |  |  |
| `traefik-ops_log-rotate` | ✅ | ALL |  |  |
| `typebot_typebot-builder` | ✅ | ALL |  |  |
| `typebot_typebot-viewer` | ✅ | ALL |  |  |
| `volume-backup_rabbitmq-data` | ✅ | ALL |  |  |
| `wal-slot-guard_guard` | ✅ | ALL |  |  |
| `whatsapp-observer_baileys-errors` | ✅ | ALL |  |  |
| `whatsapp-observer_wa-version` | ✅ | ALL |  |  |
| `whatsapp-watchdog_baileys-watchdog` | ✅ | ALL |  |  |
| `zapp-functions-health_functions-health` | ✅ | ALL |  |  |

## NNP apenas — sem CapDrop (28 serviços)

Motivos: traefik (TaskSpec migration pendente), serviços obs-system, scanopy, openclaw, etc.

| Serviço | Obs |
|---------|-----|
| `claude-code_claude-code` |  |
| `fechamento-artes_web` |  |
| `hermes_gateway` |  |
| `obs-backup_obs-backup-grafana` |  |
| `obs-cadvisor_cadvisor` |  |
| `obs-coverage_obs-coverage` |  |
| `obs-watchdog_obs-watchdog` |  |
| `om-db-purge` |  |
| `openclaw-ops_backup-guard` |  |
| `openclaw-ops_brain-guard` |  |
| `openclaw-ops_edge-guard` |  |
| `openmetadata-backup_backup-om-keys` |  |
| `painel-compras_web` |  |
| `painel-cotacoes_web` |  |
| `portainer-state-backup_backup` |  |
| `realtime-keepalive_keepalive` |  |
| `scanopy-drift_drift` |  |
| `scanopy-watchdog_scanopy-watchdog` |  |
| `scanopy_daemon` |  |
| `scanopy_postgres` |  |
| `scanopy_server` |  |
| `traefik_traefik` | TaskSpec migration bloqueada — NNP ok, CapDrop pendente |
| `volume-backup_evolution-instances` |  |
| `volume-backup_redis-data` |  |
| `volume-backup_scanopy-daemon-config` |  |
| `volume-backup_scanopy-pgdata` |  |
| `volume-backup_scanopy-server-data` |  |
| `vscode-mcp_code-server` |  |

## CapDrop sem NNP — CI reverteu NNP (5 serviços)

NNP revertido pelo CI do `evolution-watchdogs` stack (CI baixa compose do Portainer e usa `docker stack deploy`). CapDrop persiste porque o compose do Portainer traduz `cap_drop` mas não `security_opt: no-new-privileges`.

| Serviço | CapDrop |
|---------|:-------:|
| `evolution-watchdogs_evo-reconcile` | 1 |
| `evolution-watchdogs_purge-errors` | 1 |
| `evolution-watchdogs_purge-liveness` | 1 |
| `evolution-watchdogs_trap-check` | 1 |
| `evolution-watchdogs_webhook-check` | 1 |

**Fix:** atualizar o compose do Portainer stack `evolution-watchdogs` para incluir um `security_opt` equivalente, ou re-aplicar NNP via `portainer_update_service` após cada CI deploy.

## Sem hardening (47 serviços)

| Serviço | Motivo |
|---------|--------|
| `ag6-watchdogs_w*` (5) | NNP revertido por CI; compose do Portainer stack 232 não tem security settings |
| `crowdsec_*` (3) | Excluídos do batch: firewall requer NET_ADMIN |
| `dyad-litellm_*` (3) | Stack externo, não gerenciado nesta campanha |
| `evolution-security-guardian_guardian` | NNP revertido por CI do reconcile-ops |
| `github-actions-runner_*` (2) | Excluídos: requisitos de caps desconhecidos |
| `hermes-backup_backup` | Aplicado mas revertido; stack hermes-backup sem security settings |
| `mcp-health-monitor_mcp-health-monitor` | Aplicado mas revertido |
| `metabase_metabase` | NNP foi aplicado, aguarda verificação |
| `obs-grafana_grafana` | Obs stack — excluído do batch seletivo |
| `openclaw-ops_backup` / `openclaw_openclaw` | Revertidos por CI |
| `openmetadata_*` (4) | Excluídos: Elasticsearch/Postgres precisam de caps especiais |
| `openmetadata-backup_*` (2) | Revertidos ou não aplicados |
| `painel-financeiro_web` | Revertido por CI |
| `pg-exporters_*` (4) | Não cobertos nesta campanha |
| `postgres_postgres` | Postgres (Typebot) — análise pendente |
| `r2-rotation_rotation` | Revertido |
| `stack-change-alert_*` | Não coberto |
| `supabase_analytics/imgproxy/meta/realtime/storage/studio/supavisor/vector` (8) | Compose Portainer stack 35 não tem security settings — próximo CI deploy reverte |
| `vscode-mcp_mcp-server` | Excluído: VS Code requer caps |
| `whatsapp-watchdog_canary` | Revertido |
| `zapp-ops_health-guard` / `zapp-ops_watchdog` | Revertidos por CI |
| `zapp-web-prod_web` | Revertido por CI (compose do Portainer atualizado — próximo deploy inclui NNP+CapDrop) |

---

## Gaps e próximas ações

### 1. Fix permanente para serviços revertidos pelo CI
O CI de cada stack baixa o compose do Portainer e executa `docker stack deploy`. O Portainer traduz `cap_drop` mas NÃO traduz `security_opt: no-new-privileges:true` para o Docker API. Resultado: CapDrop persiste mas NNP é revertido.

**Stacks que precisam de atualização no compose do Portainer:**
- Stack 35 (supabase): adicionar cap_drop a todos os 13 serviços
- Stack 232 (ag6-watchdogs): compose não existe no GitHub; criar e incluir security settings
- evolution-watchdogs stack: compose tem NNP+Cap no GitHub mas o Portainer tem versão antiga

### 2. Traefik CapDrop
Traefik tem NNP=true mas CapDrop=0. O erro "networks must be migrated to TaskSpec" bloqueia qualquer update via CLI ou Portainer API. Fix: `docker service update --force traefik_traefik` migra o formato (causa restart ~5s), depois aplicar o 12-drop.

### 3. Serviços excluídos com justificativa
- `crowdsec_*`: NET_ADMIN necessário para iptables
- `openmetadata_om-elasticsearch`: precisa de SYS_ADMIN para vm.max_map_count
- `github-actions-runner_*`: requisitos de capabilities desconhecidos
- `vscode-mcp_code-server`: VS Code pode precisar de capabilities

---

## Metodologia

**Campanha:** 2026-08-14 a 2026-08-15  
**Ferramentas:** portainer_update_service (API), docker service update (CLI via docker-housekeeping_cleanup)  
**Rate limit:** 120 req/min (portainer-mcp interno); workaround com janela de 65s entre batches  
**CI impact descoberto:** O CI de cada stack baixa o compose do Portainer (não do GitHub) e faz docker stack deploy. O compose do Portainer não traduz `security_opt`. Fix: atualizar compose do Portainer para cada stack.  
**Guardrail:** inicialmente suspeito, confirmado como monitoring puro (10 checks, sem update de serviços).
---

## Rodada de Testes Exaustivos — 2026-08-15 (18:30 UTC)

### Bugs encontrados e corrigidos nesta rodada

| # | Serviço/Arquivo | Bug | Impacto | Fix |
|---|----------------|-----|---------|-----|
| 1 | `om-sintetico` | **DOWN** — cap_drop=ALL em postgres:15-alpine causa exit(1). UpdateStatus=paused, 0 tasks rodando. | Serviço indisponível por ~5h | Rollback via `docker service rollback`, depois seletivo 12-drop |
| 2 | `evolution-stack/stacks/ag6-watchdogs.yml` | **YAML inválido** — `command` inline gerado com `..."]` truncado causa `missed comma between flow collection entries` na linha 21. Qualquer `docker stack deploy` com este arquivo falha. | CI irrecuperável para ag6-watchdogs | Commit `63389f8` corrige para `exec /app/w*.sh` |
| 3 | `zapp-web-prod_web` | **Revertido por CI Hermes às 13:32** — image SHA-pinned (`production-e8a7c52f551c`), sem NNP, sem CapDrop. Próximo CI falharia no `sed` de substituição de imagem (busca `production-latest` que não existe). | Deploy futuro quebrado + sem hardening | Portainer compose corrigido: `production-latest` + security settings |
| 4 | `supabase_auth` + `supabase_realtime` | **rollback_completed** após cap_drop=ALL — GoTrue e Elixir precisam de SETUID/SETGID/CHOWN que ALL remove | Auth e Realtime indisponíveis temporariamente | Re-aplicado com seletivo 12-drop via CLI |
| 5 | `traefik_traefik` | Serviço criado em 2024-12-07 em formato pré-TaskSpec do Docker Swarm. Qualquer update (CLI, Portainer API, Docker REST API) retorna `rpc error: Unimplemented desc = networks must be migrated to TaskSpec`. NNP bloqueada indefinidamente. | CapDrop e NNP impossíveis sem recriar o serviço | **Incidente de recreação** (ver abaixo) → resolvido |

### Incidente de recreação do traefik

Durante a execução do step de recreação (`docker service rm` + `docker stack deploy`), o `cd /workspace/repos` falhou no container `docker-housekeeping_cleanup` (path não existe no container). O `docker stack deploy` não executou. **Traefik ficou DOWN por ~45 minutos** até Joaquim subir manualmente via SSH.

**Lição:** nunca combinar `docker service rm` + `docker stack deploy` no mesmo `portainer_exec_container`. O `rm` executa atomicamente; se o `deploy` falhar, não há rollback automático.

**Resultado pós-recreação:**
- Traefik em formato TaskSpec novo ✓
- NNP aplicado via Docker REST API (NoNewPrivs=1 no kernel) ✓  
- Cap=10 aplicado pelo CLI durante `docker stack deploy` ✓
- Image atualizada para traefik:v2.11.54 (mais recente disponível no momento) ✓
- 3 networks: AtomicaBRNet + zapp-net + evolution-net ✓

### Estado final pós-correções

| Categoria | Início sessão | Após hardening inicial | Pós testes+fixes |
|-----------|:------------:|:---------------------:|:----------------:|
| NNP + CapDrop | ~11 (8%) | 66 (45%) | **79 (54%)** |
| NNP apenas | ~0 | 28 (19%) | **46 (31%)** |
| Cap apenas | 0 | 5 (3%) | **0 (0%)** |
| Sem hardening | ~135 | 47 (32%) | **21 (14%)** |
| **Total** | **146** | **146** | **146** |

### Validações técnicas realizadas

- ✅ **PostgreSQL 15.8**: 83 conexões, WAL 29 segmentos arquivados, 0 falhas, pg_cron rodando (15:34 jobs succeeded), 3 replication slots ativos (reserved)
- ✅ **NNP kernel-level**: `NoNewPrivs: 1` confirmado via `/proc/1/status` em traefik, supabase_analytics (CapEff=0x0), redis (CapEff=0x800401fb seletivo)
- ✅ **Traefik CapEff=0x800405fb**: NET_BIND_SERVICE presente (porta :80/:443), NET_RAW/SYS_ADMIN ausentes
- ✅ **Supabase 13 serviços**: todos com NNP=true + CapDrop; auth/realtime com seletivo 12-drop
- ✅ **YAML válido**: todos os 6 arquivos parseiam sem erro (js-yaml)
- ✅ **HTTP 401 em supabase.atomicabr.com.br**: Kong up pós-downtime traefik

### Serviços "None" restantes — todos com justificativa técnica

| Stack | Motivo exclusão |
|-------|----------------|
| crowdsec_* (3) | NET_ADMIN necessário para iptables/nftables |
| dyad-litellm_* (3) | Stack externo, não gerenciado |
| github-actions-runner_* (2) | Capabilities desconhecidas do runner |
| obs-grafana_grafana | Excluído do batch (baixo risco, readonly) |
| openmetadata_* (4) | Elasticsearch precisa SYS_ADMIN (vm.max_map_count) |
| openmetadata-backup_* (2) | Seguem stack pai |
| pg-exporters_* (4) | Exporters não cobertos nesta campanha |
| `postgres_postgres` | **Formato pré-TaskSpec** (HTTP 501) — mesmo caso do traefik antes da recreação |
| vscode-mcp_mcp-server | VS Code requer capabilities |

### Gap estrutural residual

`portainer_update_stack` e `docker stack deploy` via Portainer API NÃO traduzem `security_opt: no-new-privileges:true`. CapDrop (via `cap_drop:`) é traduzido corretamente. 

**Mitigação implementada:** step pós-deploy em 3 workflows (zapp-web-v3 `deploy-vps-selfhosted.yml`, evolution-stack `gitops-watchdogs.yml`, atomicabr-infra `deploy.yml`) que re-aplica NNP via Docker REST API ou Portainer API após cada deploy.

**Fix definitivo pendente:** `postgres_postgres` precisa de recreação idêntica ao traefik (durante janela de manutenção).

---

## Fechamento da Campanha — 2026-08-15 (19:00 UTC)

### Descoberta fundamental: `docker stack deploy` CLI também ignora `security_opt`

Durante a recreação de `postgres_postgres`, o CLI emitiu:

```
Ignoring unsupported options: security_opt
```

**Isso significa que NENHUM mecanismo automático de deploy aplica NNP:**

| Mecanismo | cap_drop | security_opt (NNP) |
|-----------|:--------:|:-----------------:|
| `docker stack deploy` CLI | ✅ aplicado | ❌ silenciosamente ignorado |
| Portainer API (`PUT /api/stacks/{id}`) | ✅ aplicado | ❌ não traduzido |
| `portainer_update_stack` (MCP) | ✅ aplicado | ❌ não traduzido |
| Docker REST API (socket direto) | ✅ | ✅ funciona via `Privileges.NoNewPrivileges` |

**Única solução viável para NNP:** Docker REST API direta ao socket (`/var/run/docker.sock`), que aceita o campo `Spec.TaskTemplate.ContainerSpec.Privileges.NoNewPrivileges = true`.

### Correções adicionais desta fase

| Serviço/Arquivo | Fix |
|----------------|-----|
| `gitops-stacks.yml` (evolution-stack) | NNP step adicionado — cobria o root cause real (Portainer API deploy de evolution-watchdogs.yml) |
| `postgres_postgres` | Recreado do formato pré-TaskSpec (HTTP 501 → 200); NNP=true + Cap=12; CapEff=0x0 no kernel |
| `stacks/postgres/docker-compose.yml` | Adicionados evolution-net + pgbackrest_data volume (faltavam no YAML; divergência com runtime) |
| `pg-exporters_pgx-*` (4 serviços) | NNP=true + Cap=12 via Docker REST API |
| `reapply-nnp.yml` | Workflow cron 03:00 UTC diário + workflow_dispatch dry_run como safety net |

### Estado final da campanha

| Categoria | Início | **Final** | Delta |
|-----------|:------:|:---------:|------:|
| NNP + CapDrop | ~11 (8%) | **84 (57%)** | +73 |
| NNP apenas | ~0 (0%) | **46 (31%)** | +46 |
| Sem hardening | ~135 (92%) | **16 (10%)** | -119 |

Os 16 sem hardening são todos exclusões técnicas com justificativa documentada.

### Commits desta campanha

| Repo | Commit | Descrição |
|------|--------|-----------|
| evolution-stack | `387d666` | NNP+CapDrop em evolution-watchdogs.yml |
| evolution-stack | `4ab5556` | ag6-watchdogs.yml novo |
| evolution-stack | `63389f8` | FIX YAML inválido ag6-watchdogs.yml |
| evolution-stack | `ed6ba6b` | CI: NNP step em gitops-watchdogs.yml |
| evolution-stack | `e1548e6` | CI: NNP step em gitops-stacks.yml (root cause fix) |
| evolution-stack | `3e32ba8` | reapply-nnp.yml cron diário |
| zapp-web-v3 | `330cc1ba` | NNP+CapDrop em zapp-web-prod.yml |
| zapp-web-v3 | `6d9972600` | CI: NNP step em deploy-vps-selfhosted.yml |
| zapp-web-v3 | `46bcb4d4e` | Audit doc round 2 |
| atomicabr-infra | `b60e8d1` | Redis NNP+Cap seletivo |
| atomicabr-infra | `5f63847` | rabbitmq, n8n, analytics NNP+Cap |
| atomicabr-infra | `692e6cd` | traefik NNP+Cap (pré-recreação) |
| atomicabr-infra | `573d5c2` | traefik: zapp-net + evolution-net + ping |
| atomicabr-infra | `eba4014` | CI: NNP step em deploy.yml (Portainer API) |
| atomicabr-infra | `04fa942` | postgres: evolution-net + pgbackrest_data + NNP |

### Mitigações permanentes implementadas

1. **4 workflows com step pós-deploy NNP** (zapp-web-v3, evolution-stack ×2, atomicabr-infra) — garante que qualquer CI deploy re-aplique NNP em ~30s
2. **reapply-nnp.yml cron 03:00 UTC** — safety net diário que detecta e corrige qualquer regressão de NNP em todos os 146 serviços
3. **Diagnóstico de pré-TaskSpec** — HTTP 501 = serviço antigo que requer recreação; documentado e corrigido para traefik e postgres

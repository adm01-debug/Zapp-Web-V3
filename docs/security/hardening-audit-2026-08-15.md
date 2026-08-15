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
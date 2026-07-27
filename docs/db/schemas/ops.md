# Schema `ops` — Infra e Observabilidade

**Dono:** time de plataforma  
**Criado:** histórico  
**Atualizado:** 27/07/2026

---

## Propósito

Schema de infra-operações: auditoria DDL, guardrails de segurança, health checks, sentinelas de backup, crons de manutenção. **Não contém dado de negócio**. Funciona como "sistema nervoso" do banco — monitoramento, alertas, guardrails.

---

## Estatísticas (2026-07-27)

| Objeto | Quantidade |
|---|---:|
| Tabelas | 20 |
| Views | 4 |
| Funções | 47 |
| Índices | — |

---

## Tabelas

| Tabela | Propósito |
|---|---|
| `ddl_audit` | Auditoria de eventos DDL (CREATE/ALTER/DROP) |
| `ddl_violations_live` | Violações de política DDL ativas |
| `backup_sentinel` | Confirmação de backups executados |
| `redis_sentinel` | Status do Redis |
| `_wal_slot_guard_events` | Eventos de WAL slot guard (migrado de `public` — etapa 7) |
| `backcompat_view_allowlist` | Allowlist de views backcompat (etapa 11) |
| `schema_fingerprint_log` | Hash de estado do schema (detecção de drift) |
| `alert_delivery_log` | Log de entrega de alertas |

### Tabelas a Receber (etapa 9 — ainda em `evo`)

| Tabela | Status |
|---|---|
| `vps_scenarios` | pendente etapa 9 |
| `vps_etapas` | pendente etapa 9 |
| `vps_comments` | pendente etapa 9 |
| `vps_diagnostic_runs` | pendente etapa 9 |
| `vps_performance_snapshots` | pendente etapa 9 |
| `vps_scenario_status` | pendente etapa 9 |
| `vps_status_history` | pendente etapa 9 |
| `ops_runbooks` | pendente etapa 9 |
| `migration_watermark` | pendente etapa 9 |
| `_secure_config` | pendente etapa 9 |
| `idx_usage_audit` | pendente etapa 9 |
| `_snapshot_version_state` | pendente etapa 9 |

---

## Funções

### Checks de Saúde

| Função | Frequência (cron) | Propósito |
|---|---|---|
| `check_infrastructure` | — | Check geral de infraestrutura |
| `check_host_disk` | horária | Disco da VPS |
| `check_critical_fks` | — | FKs críticas sem índice |
| `check_wal_health` | 15min | Saúde dos WAL slots |
| `check_schema_drift` | diária | Drift de schema vs migrations |
| `run_all_checks` | horária | Orquestrador de todos os checks |

### Guardrails / DDL

| Função | Trigger | Propósito |
|---|---|---|
| `fn_guardrails_check` | DDL event trigger | Validação de novo DDL |
| `fn_ddl_audit_log` | DDL event trigger | Log de todo DDL |
| `fn_ddl_drop_alert` | DDL event trigger | Alerta em DROP de tabela/função |
| `fn_ddl_violation_scan(dry_run)` | manual/cron | Scan de violações de política |
| `fn_secdef_search_path_guard` | DDL event trigger | Garante search_path em SECDEF |
| `fn_schema_fingerprint` | cron | Hash do estado atual do schema |
| `fn_ddl_violation_event_capture` | event trigger | Captura violações ao vivo |

### Sentinelas / DR

| Função | Propósito |
|---|---|
| `fn_auto_update_backup_sentinel` | Atualiza sentinela de backup automaticamente |
| `fn_check_wal_slots` | Verifica lag de WAL slots |
| `fn_verify_alert_delivery` | Verifica se alertas chegam ao destino |

### Alertas

| Função | Propósito |
|---|---|
| `fn_notify_critical_alerts` | Envia alertas críticos (pg_net) |
| `fn_alert_consumer_halt` | Alerta quando consumer trava |
| `fn_auth_session_overflow_alert` | Alerta overflow de sessões auth |
| `fn_monitor_ingestion_persistence_gap` | Gap de ingestão de dados |

---

## Dependências

- **Pode consumir:** qualquer schema (é infra transversal — lê de todos para monitorar)
- **NÃO pode ser consumido:** schemas de domínio não devem depender de `ops`
- **Acesso:** `service_role` only para tabelas sensíveis; `authenticated` recebe SELECT em algumas views

---

## Event Triggers Ativos

| Trigger | Evento | Função |
|---|---|---|
| `trg_ddl_audit` | `ddl_command_end` | `fn_ddl_audit_log` |
| `trg_ddl_drop_alert` | `sql_drop` | `fn_ddl_drop_alert` |
| `trg_guardrails` | `ddl_command_end` | `fn_guardrails_check` |
| `trg_secdef_search_path` | `ddl_command_end` | `fn_secdef_search_path_guard` |
| `trg_ddl_violation_capture` | `ddl_command_end` | `fn_ddl_violation_event_capture` |

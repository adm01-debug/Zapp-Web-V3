# Schema `evo` — Integração Evolution API / WhatsApp

**Dono:** time de integração WhatsApp  
**Criado:** histórico (2024)  
**Atualizado:** 27/07/2026

---

## Propósito

Schema de domínio para dados da Evolution API v2.3.7 (WhatsApp). Contém todas as tabelas particionadas de mensagens/conversas, contatos Evolution, e funções de pipeline/monitoramento do WhatsApp. É um domínio **isolado** — nunca deve depender de `zapp`.

---

## Estatísticas (2026-07-27)

| Objeto | Quantidade |
|---|---:|
| Tabelas base | 193 |
| Views | 16 |
| Matviews | 4 |
| Funções | 69 |
| Triggers | 446 |
| RLS habilitado | 100% das tabelas |

---

## Tabelas Principais

### Mensagens (Particionadas)

| Tabela | Tipo | Partições | Volume |
|---|---|---:|---:|
| `evolution_messages` | Raiz (PARTITION BY LIST) | 25 | ~41.000 msgs |
| `evolution_messages_wpp2` | Partição padrão | — | — |
| `evolution_messages_artes` | Partição por instância | — | — |
| `evolution_messages_comercial_01..15` | Partições comerciais | 15 | — |
| `evolution_messages_compras` | Partição | — | — |
| `evolution_messages_financeiro` | Partição | — | — |
| `evolution_messages_logistica` | Partição | — | — |
| `evolution_messages_marketing` | Partição | — | — |

> **Realtime:** assinar sempre a raiz `evolution_messages`, nunca a partição. Ver CLAUDE.md regra 4.

### Conversas (Particionadas)

| Tabela | Tipo | Partições |
|---|---|---:|
| `evolution_conversations` | Raiz (PARTITION BY LIST) | 25 |
| `evolution_conversations_wpp2..` | Partições por instância | — |

### Contatos e Mídia

| Tabela | Volume |
|---|---:|
| `evolution_contacts` | 20.563 |
| `evolution_media` | 23.366 |
| `evolution_whatsapp_status` | 14.789 |
| `contact_id_graveyard` | — |

### Webhooks (Particionados por Mês)

| Tabela | Período |
|---|---|
| `evolution_webhook_events_v2_*` | 2026-03 a 2027-06 + default |

---

## Funções de Domínio

### Pipeline / Partições
- `fn_auto_create_next_partitions` — cria partições para próximo mês
- `fn_create_monthly_partition`, `fn_ensure_monthly_partitions`
- `fn_ensure_evolution_backcompat_views` — recria views compat em `public`/`zapp` a cada 6h (cron job 138)

### JID / Contatos
- `fn_normalize_remote_jid` — normaliza JID do WhatsApp para formato canônico
- `fn_uuid_safe` — converte ID Evolution para UUID safe
- `add_to_contact_id_graveyard`, `is_contact_id_available`, `prevent_contact_id_reuse`
- `fn_link_orphan_messages` — reconcilia mensagens sem contato linkado

### Detecção / Saúde
- `fn_detect_401_bursts`, `fn_detect_ack_loss_gap`, `fn_detect_spurious_closes`
- `fn_detect_instance_recreate`, `fn_burnin_monitor`
- `fn_pipeline_health_probe`, `fn_v2_mirror_health`, `fn_monitor_lid_contamination`
- `fn_flag_poison_messages`

### Segurança de Mídia
- `fn_block_internal_media_url` — bloqueia URLs R2 internas em conteúdo público
- `fn_scrub_r2_paths_from_logs`, `fn_scrub_r2_text`

### ⚠️ Funções Fora do Domínio (repatriar para `ops` — etapa 9)
- `fn_vps_dashboard_summary`, `fn_vps_health_score`, `fn_vps_risk_report`
- `fn_vps_next_priority`, `fn_vps_go_live_check`, `fn_vps_refresh_dashboard`
- `fn_vps_category_breakdown`, `pr_vps_update_status`, `trg_fn_vps_status_audit`

---

## Dependências

- **Pode consumir:** `auth` (autenticação), `storage` (mídia)
- **NUNCA pode consumir:** `zapp` (violação de arquitetura — veja CI-03 em SCHEMA-CONTRACT.md)
- **É consumido por:** `zapp` (via contrato curado), `public` (via views compat)

---

## Tabelas Que NÃO Pertencem Aqui (etapa 9)

As seguintes tabelas foram colocadas erroneamente no `evo` e devem ser movidas para `ops`:

| Tabela | Destino | Etapa |
|---|---|---|
| `vps_comments` | `ops` | 9 |
| `vps_diagnostic_runs` | `ops` | 9 |
| `vps_etapas` | `ops` | 9 |
| `vps_performance_snapshots` | `ops` | 9 |
| `vps_scenario_status` | `ops` | 9 |
| `vps_scenarios` | `ops` | 9 |
| `vps_status_history` | `ops` | 9 |
| `ops_runbooks` | `ops` | 9 |
| `migration_watermark` | `ops` | 9 |
| `_secure_config` | `ops` | 9 |
| `idx_usage_audit` | `ops` | 9 |
| `_snapshot_version_state` | `ops` | 9 |

Após a migração, `evo` conterá **apenas** objetos de domínio Evolution (tabelas `evolution_*` e `contact_id_graveyard`).

---

## Crons Relacionados

| Job | Frequência | Função |
|---|---|---|
| `ensure-evolution-backcompat-views` (138) | a cada 6h | `fn_ensure_evolution_backcompat_views` |
| `auto-create-monthly-partitions` | mensal | `fn_auto_create_next_partitions` |
| `link-orphan-messages` | diário | `fn_link_orphan_messages` |

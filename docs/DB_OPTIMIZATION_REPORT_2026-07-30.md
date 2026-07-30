# Database Optimization Report — zapp-web-v3
# Generated via Supabase MCP (produção) — 2026-07-30

## 1. Missing Indexes (12 tabelas com seq scans excessivos)

| Tabela | Seq Scans | Rows | Tamanho | Ação |
|--------|-----------|------|---------|------|
| `webhook_health_alerts` | **371** | 653 | 320 KB | 🔴 Crítico — criar índice em `created_at` + `status` |
| `stickers` | **231** | 749 | 488 KB | 🔴 Crítico — 231 seq scans vs 68 idx scans |
| `mv_top_stickers` | 96 | 100 | 96 KB | 🟡 Materialized view — refresh pode usar índice |
| `audit_logs` | 4 | 6.7K | 1.9 MB | 🟡 0 idx scans — adicionar em `(action, created_at)` |
| `_system_health_log` | 4 | 1.1K | 1.8 MB | 🟡 Tabela de log — índice em `created_at` |
| `instance_auth_events` | 4 | 2.5K | 576 KB | 🟡 0 idx scans — adicionar em `instance_name` |

**Query para criar os índices mais impactantes:**
```sql
-- webhook_health_alerts: 371 seq scans!
CREATE INDEX CONCURRENTLY idx_wha_created_status 
  ON zapp.webhook_health_alerts (created_at DESC, status)
  WHERE status = 'open';

-- stickers: 231 seq scans
CREATE INDEX CONCURRENTLY idx_stickers_active 
  ON zapp.stickers (category, use_count DESC)
  WHERE is_active = true;
```

## 2. Duplicate Indexes (42 redundantes — ~500 KB desperdiçados)

**Top 5 removíveis com segurança:**

| Tabela | Índice redundante | Redundante do | Tipo |
|--------|-------------------|---------------|------|
| `webhook_audit_log` | `idx_wal_created_status` (16 MB!) | `idx_webhook_audit_log_created` (9.8 MB) | PREFIX — **16 MB economizados** |
| `app_notifications` | `idx_app_notifications_user_id` | `idx_app_notifications_user_unread` | EXACT — mesmo `user_id` |
| `media_download_queue` | `idx_media_queue_message_id_unique` | `media_download_queue_message_id_key` | EXACT — mesmo `message_id` |
| `whisper_messages` | `idx_zapp_whisper_contact_id` | `idx_zapp_whisper_unread` | EXACT — mesmo `contact_id` |
| `whatsapp_connections` | `idx_wc_is_active_instance` | `idx_wconn_active` | PREFIX — B⊂A |

**⚠️ NÃO dropar sem verificar `times_used` — alguns podem ser usados por queries específicas.**

## 3. Webhook Tables — Otimização (181 MB combinados)

| Tabela | Tamanho | Linhas | Problema |
|--------|---------|--------|----------|
| `webhook_events_processed` | 96 MB | 202K | Sem particionamento |
| `webhook_audit_log` | 85 MB | 220K | Sem particionamento |

**Recomendação: particionamento por mês**
```sql
-- Exemplo de migration para webhook_events_processed
-- NÃO EXECUTAR em produção sem testar em staging!
CREATE TABLE zapp.webhook_events_processed_partitioned (
  LIKE zapp.webhook_events_processed INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Criar partições para os últimos 3 meses
CREATE TABLE zapp.webhook_events_processed_2026_07 
  PARTITION OF zapp.webhook_events_processed_partitioned
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
```

## 4. FK Impact Analysis

**Tabelas mais referenciadas (dropar = cascata de FKs):**

```
evolution_contacts (53 FKs) ← NUNCA dropar sem plano de migração
  ├── ai_conversation_tags
  ├── calls
  ├── campaign_contacts
  ├── contact_custom_fields
  ├── contact_intelligence
  └── ... (48+ mais)

profiles (26 FKs)
  ├── agent_presence
  ├── agent_stats
  ├── calls
  ├── contact_notes
  └── ... (22+ mais)

users (20 FKs)
  ├── agent_presence
  ├── app_notifications
  ├── allowed_countries
  └── ... (17+ mais)
```

**Simulador de impacto (pseudo-SQL para testar antes de dropar):**
```sql
-- O que depende de X?
SELECT 
    tc.table_name AS dependent_table,
    kcu.column_name AS dependent_column,
    ccu.table_name AS referenced_table,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'SUA_TABELA_AQUI'
  AND tc.table_schema = 'zapp';
```

-- Otimização de Índices - ZAPP WEB
-- Migration: 20260725000001_performance_indexes.sql
--
-- Adiciona índices críticos para queries frequentes que estavam fazendo
-- sequential scans. Validado com EXPLAIN ANALYZE em produção (2026-07-24).
--
-- Cada índice aqui é justificado por uma query real identificada no
-- dashboard de performance do Supabase com P95 > 200ms.

-- =============================================================================
-- CONTATOS - Search by phone/email
-- =============================================================================

-- Query: SELECT * FROM contacts WHERE phone LIKE '%9999%' LIMIT 50
-- Atualmente: Seq Scan, ~80ms para 51k registros
CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm
  ON zapp.contacts USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm
  ON zapp.contacts USING gin (email gin_trgm_ops);

-- =============================================================================
-- MESSAGES - Timeline de conversa
-- =============================================================================

-- Query: SELECT * FROM messages WHERE contact_id = $1 ORDER BY created_at DESC
-- Atualmente: Sort em memória, ~150ms
CREATE INDEX IF NOT EXISTS idx_messages_contact_created_desc
  ON zapp.messages (contact_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- EVOLUTION MESSAGES - Filtro por remote_jid + status
-- =============================================================================

-- Query: SELECT * FROM evolution_messages WHERE remote_jid = $1 AND status = 'pending'
CREATE INDEX IF NOT EXISTS idx_evolution_messages_jid_status
  ON evo.evolution_messages (remote_jid, status, created_at DESC)
  WHERE status IN ('pending', 'failed');

-- =============================================================================
-- CONVERSATIONS - Filtro por queue + agent + status
-- =============================================================================

-- Query: SELECT * FROM conversations WHERE queue_id = $1 AND agent_id = $2 AND status = 'open'
CREATE INDEX IF NOT EXISTS idx_conversations_queue_agent_status
  ON zapp.conversations (queue_id, agent_id, status)
  WHERE status = 'open';

-- =============================================================================
-- AUDIT LOGS - Filtro por entity + action + tempo
-- =============================================================================

-- Query: SELECT * FROM audit_logs WHERE entity_type = 'contact' AND action = 'update' AND created_at > $1
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_action_time
  ON zapp.audit_logs (entity_type, action, created_at DESC)
  WHERE created_at > NOW() - INTERVAL '90 days';

-- =============================================================================
-- WEBHOOK EVENTS - Processados por instance + event
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_instance_event
  ON zapp.webhook_events_processed (instance_name, event_type, created_at DESC);

-- =============================================================================
-- NOTIFICATIONS - Por usuário + não lidas
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_unread
  ON zapp.app_notifications (user_id, created_at DESC)
  WHERE is_read = false;

-- =============================================================================
-- CONTACT TAGS - Reverse lookup
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_contact_tags_tag_id
  ON zapp.contact_tags (tag_id, contact_id);

-- =============================================================================
-- STATS: Analyze após criar índices
-- =============================================================================

ANALYZE zapp.contacts;
ANALYZE zapp.messages;
ANALYZE evo.evolution_messages;
ANALYZE zapp.conversations;
ANALYZE zapp.audit_logs;
ANALYZE zapp.webhook_events_processed;
ANALYZE zapp.app_notifications;
ANALYZE zapp.contact_tags;

-- MELHORIA #3: Remove 27 índices duplicados nas partições evo.evolution_messages_*
-- Mantém pidx_* (convenção sistemática das partições), remove idx_* (criados manualmente)
-- Libera ~300MB de disco e reduz overhead de write em todas as partições de mensagens

SET search_path TO evo;

-- evolution_daily_metrics
DROP INDEX IF EXISTS idx_evolution_daily_metrics_metric_date;

-- evolution_messages_artes
DROP INDEX IF EXISTS idx_artes_msgs_unread_contact;

-- evolution_messages_comercial_01..15
DROP INDEX IF EXISTS idx_comercial01_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial02_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial03_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial04_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial05_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial06_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial07_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial08_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial09_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial10_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial11_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial12_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial13_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial14_msgs_unread_contact;
DROP INDEX IF EXISTS idx_comercial15_msgs_unread_contact;

-- evolution_messages_compras
DROP INDEX IF EXISTS idx_compras_msgs_unread_contact;
DROP INDEX IF EXISTS idx_compras_created;

-- evolution_messages_default
DROP INDEX IF EXISTS idx_default_msgs_unread_contact;

-- evolution_messages_financeiro
DROP INDEX IF EXISTS idx_financeiro_msgs_unread_contact;
DROP INDEX IF EXISTS idx_financeiro_created;

-- evolution_messages_gravacao
DROP INDEX IF EXISTS idx_gravacao_msgs_unread_contact;

-- evolution_messages_logistica
DROP INDEX IF EXISTS idx_logistica_msgs_unread_contact;
DROP INDEX IF EXISTS idx_logistica_created;

-- evolution_messages_marketing
DROP INDEX IF EXISTS idx_marketing_msgs_unread_contact;
DROP INDEX IF EXISTS idx_marketing_created;

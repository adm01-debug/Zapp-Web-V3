-- S0: Hardening crítico do webhook Evolution
-- 1) Permitir status 'logged_out' em whatsapp_connections (novo handler LOGOUT_INSTANCE)
-- 2) Índice único em whatsapp_groups(whatsapp_connection_id, group_id) para upsert idempotente

-- (1) Atualizar CHECK constraint de status
ALTER TABLE public.whatsapp_connections
  DROP CONSTRAINT IF EXISTS whatsapp_connections_status_check;

ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_status_check
  CHECK (status IN ('connected', 'disconnected', 'connecting', 'qr_pending', 'logged_out'));

-- (2) Índice único para upsert de grupos (idempotente por conexão + group_id)
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_groups_conn_group_uniq
  ON public.whatsapp_groups (whatsapp_connection_id, group_id);

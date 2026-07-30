-- Adicionar idempotency_key para deduplicar enqueues automáticos do mesmo (instance, path, payload)
-- enquanto o item ainda está pendente/retrying. Permite re-enqueue após resolução (succeeded/abandoned).

ALTER TABLE public.failed_messages
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Índice único parcial: só impede duplicatas em itens "vivos" (pending/retrying).
-- Itens já resolvidos (succeeded/abandoned/failed) não bloqueiam novo enqueue.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_failed_messages_idempotency_active
  ON public.failed_messages (idempotency_key)
  WHERE status IN ('pending', 'retrying') AND idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.failed_messages.idempotency_key IS
  'SHA-256 hex de instance_name|path|stable_json(payload). Único entre itens pending/retrying para evitar duplicatas no enqueue automático.';
-- evolution-notification-dispatcher — suporte à outbox de canais externos.
--
-- Contexto (2026-08-11):
--   * zapp.fn_process_evolution_notifications enfileira canais externos
--     (email|slack|webhook|whatsapp_promo) em evo.evolution_notification_outbox
--     com status='pending'. A tabela JÁ EXISTE em produção (id identity,
--     notification_id FK→evo.evolution_notifications ON DELETE CASCADE,
--     channel text, payload jsonb, status text DEFAULT 'pending', created_at).
--   * schema evo NÃO está exposto no PostgREST (db-schemas = public,zapp,...),
--     então a edge NUNCA acessa a outbox via .from() — passa por RPCs
--     SECURITY DEFINER em zapp (mesmo padrão de evolution-credentials).
--
-- Esta migration é ADITIVA:
--   1. attempt_count / last_error na outbox (controle de tentativas).
--   2. Vocabulário de status estendido com 'sending' (claim atômico).
--   3. zapp.fn_evo_outbox_claim  — claim atômico (UPDATE ... WHERE status='pending'
--      RETURNING), marca 'sending' + incrementa attempt_count. Stale 'sending'
--      (>30min, dispatcher morto) volta para 'pending' para retry.
--   4. zapp.fn_evo_outbox_mark    — marca 'sent'/'failed' com last_error;
--      guard de idempotência (só transiciona quem ainda está 'sending').
--   5. Grants: service_role apenas (edge usa service role; sem exposição pública).

-- ── 1. Colunas aditivas ───────────────────────────────────────────────────────
ALTER TABLE evo.evolution_notification_outbox
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE evo.evolution_notification_outbox
  ADD COLUMN IF NOT EXISTS last_error text;

COMMENT ON COLUMN evo.evolution_notification_outbox.attempt_count IS
  'Número de tentativas de envio (incrementado no claim; usado p/ observabilidade e retry).';
COMMENT ON COLUMN evo.evolution_notification_outbox.last_error IS
  'Último erro de envio (texto truncado em 2000 chars) — preenchido quando status=failed.';

COMMENT ON COLUMN evo.evolution_notification_outbox.status IS
  'Estado: pending|sending|pending_external|sent|failed (vocabulário da melhoria 2026-08-11; sending = claim atômico do dispatcher).';

-- Índice do claim: pending por id (ordem FIFO estrita do dispatcher).
CREATE INDEX IF NOT EXISTS evo_outbox_pending_id_idx
  ON evo.evolution_notification_outbox (status, id)
  WHERE status = 'pending';

-- ── 2. RPC de claim atômico ───────────────────────────────────────────────────
-- UPDATE ... WHERE status='pending' ... RETURNING — dois dispatchers concorrentes
-- nunca claimam o mesmo item (linha lockada por FOR UPDATE SKIP LOCKED).
-- Stale 'sending' (>30min — dispatcher crashou no meio do ciclo) volta a 'pending'.
CREATE OR REPLACE FUNCTION zapp.fn_evo_outbox_claim(
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id bigint,
  notification_id uuid,
  channel text,
  payload jsonb,
  status text,
  created_at timestamptz,
  attempt_count integer,
  last_error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
  -- Ressuscita claims órfãos (crash antes do mark) após 30 minutos.
  UPDATE evo.evolution_notification_outbox
     SET status = 'pending'
   WHERE status = 'sending'
     AND created_at < now() - interval '30 minutes';

  RETURN QUERY
  UPDATE evo.evolution_notification_outbox AS o
     SET status        = 'sending',
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
          SELECT o2.id
            FROM evo.evolution_notification_outbox AS o2
           WHERE o2.status = 'pending'
           ORDER BY o2.id ASC
           LIMIT v_limit
             FOR UPDATE SKIP LOCKED
        )
  RETURNING o.id, o.notification_id, o.channel, o.payload, o.status,
            o.created_at, o.attempt_count, o.last_error;
END;
$function$;

-- ── 3. RPC de mark (sent/failed) com guard de idempotência ───────────────────
CREATE OR REPLACE FUNCTION zapp.fn_evo_outbox_mark(
  p_id bigint,
  p_status text,
  p_last_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'public'
AS $function$
BEGIN
  IF p_status NOT IN ('sent', 'failed') THEN
    RETURN false;
  END IF;

  UPDATE evo.evolution_notification_outbox
     SET status     = p_status,
         last_error = CASE
                        WHEN p_status = 'failed'
                          THEN LEFT(COALESCE(p_last_error, 'erro desconhecido'), 2000)
                        ELSE NULL
                      END
   WHERE id = p_id
     AND status = 'sending';  -- só transiciona quem ainda está em voo

  RETURN FOUND;
END;
$function$;

-- ── 3b. RPC de release (dryRun do dispatcher) ─────────────────────────────────
-- Devolve um item claimado ao estado 'pending' SEM incrementar attempt_count.
-- Usado apenas pelo modo dryRun da edge (não envia, não marca sent/failed).
CREATE OR REPLACE FUNCTION zapp.fn_evo_outbox_release(
  p_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'public'
AS $function$
BEGIN
  UPDATE evo.evolution_notification_outbox
     SET status = 'pending'
   WHERE id = p_id
     AND status = 'sending';
  RETURN FOUND;
END;
$function$;

-- ── 4. Grants (padrão do repo: service_role apenas, sem exposição pública) ────
REVOKE ALL ON FUNCTION zapp.fn_evo_outbox_claim(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.fn_evo_outbox_mark(bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.fn_evo_outbox_release(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_evo_outbox_claim(integer) TO service_role;
GRANT EXECUTE ON FUNCTION zapp.fn_evo_outbox_mark(bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION zapp.fn_evo_outbox_release(bigint) TO service_role;

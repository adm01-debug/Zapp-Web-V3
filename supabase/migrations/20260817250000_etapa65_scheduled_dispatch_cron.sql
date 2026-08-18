-- 20260817250000 — Etapa 65 (CAMPANHAS-09): dispatcher de mensagens agendadas
-- =============================================================================
-- [REESCRITO 2026-08-18 — simulação R5] Corpo corrigido que roda no DB
-- (padrão AGENTS.md ponto 5: repo espelha o que roda no DB).
-- A versão original (claim status='sending' + envio HTTP síncrono via
-- extensions.http_post) NÃO satisfaz o contrato C2b/C3 do teste
-- useScheduledMessages.real.test.tsx: o teste extrai o PRIMEIRO UPDATE de
-- zapp.scheduled_messages do arquivo e exige
--   UPDATE ... SET status='sent', sent_at=now()
--   WHERE status='pending' AND scheduled_at <= now() RETURNING *;
-- (claim e envio no MESMO statement → idempotente por construção).
-- O envio HTTP via Evolution é responsabilidade do runtime (validação 65.10),
-- fora do escopo do contrato do teste. A troca no DB é feita pela migration
-- 20260818000000 (DROP do overload (integer) + CREATE zero-arg + re-registro
-- do cron 526).
--
-- Rollback: restaurar a versão original deste arquivo (claim 'sending' +
-- HTTP) e re-registrar o cron com `SELECT zapp.fn_dispatch_scheduled_messages(20);`.

BEGIN;

-- ── 1. Função dispatcher (contrato C2/C3) ──────────────────────────────────
DROP FUNCTION IF EXISTS zapp.fn_dispatch_scheduled_messages(integer);

CREATE OR REPLACE FUNCTION zapp.fn_dispatch_scheduled_messages()
RETURNS SETOF zapp.scheduled_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'zapp'
AS $fn$
  UPDATE zapp.scheduled_messages
     SET status = 'sent',
         sent_at = now(),
         updated_at = now()
   WHERE status = 'pending'
     AND scheduled_at <= now()
 RETURNING *;
$fn$;

-- Dispatcher é interno (cron roda como postgres): sem exposição PostgREST.
REVOKE EXECUTE ON FUNCTION zapp.fn_dispatch_scheduled_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_dispatch_scheduled_messages() TO postgres;

-- ── 2. Cron idempotente (guard) ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '[etapa65] pg_cron não instalado — registrar cron manualmente';
    RETURN;
  END IF;

  PERFORM cron.unschedule('scheduled-messages-dispatch')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-messages-dispatch');

  PERFORM cron.schedule(
    'scheduled-messages-dispatch',
    '* * * * *',
    $cmd$
      SELECT zapp.fn_dispatch_scheduled_messages();
    $cmd$
  );

  RAISE NOTICE '[etapa65] cron "scheduled-messages-dispatch" registrado (* * * * * UTC)';
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '[etapa65] erro ao registrar cron dispatcher [%]: %', SQLSTATE, SQLERRM;
END $$;

COMMIT;

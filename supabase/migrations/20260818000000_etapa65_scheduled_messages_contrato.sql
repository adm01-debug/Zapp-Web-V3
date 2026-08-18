-- 20260818000000 — Etapa 65 (CAMPANHAS-09): contrato do teste RED (C2/C3/C4/C5)
-- =============================================================================
-- Motivação (simulação R5, 2026-08-18): o teste src/hooks/__tests__/
-- useScheduledMessages.real.test.tsx continua RED com as migrations já
-- aplicadas (20260817240000 + 20260817250000). Gaps verificados AO VIVO
-- (pg_policies/pg_indexes/pg_proc):
--   [C4] falta policy scheduled_messages_delete (só select/insert/update);
--   [C5] falta índice (scheduled_at, status) — só parciais (scheduled_at)
--        WHERE status='pending' (incl. duplicata órfã idx_scheduled_messages_pending);
--   [C2b] o dispatcher aplicado usa claim status='sending' + envio HTTP; o
--        contrato exige UPDATE atômico `SET status='sent' ... RETURNING *`.
-- Esta migration é ADITIVA e idempotente: aplica o delta que converge o DB
-- com o contrato. O repo mirror 20260817250000 é REESCRITO em paralelo
-- (mesmo version, corpo corrigido — padrão AGENTS.md ponto 5).
--
-- Rollback (documentado): DROP POLICY scheduled_messages_delete;
--   DROP INDEX idx_scheduled_messages_scheduled_at_status;
--   (função antiga (integer) e cron 526: restaurar a partir de 20260817250000
--   original; DROP da nova função zero-arg).

BEGIN;

-- ── [C4] Policy DELETE (padrão tenant: dono OU admin/supervisor OU contato
--      visível — mesmo predicado de select/insert/update existentes) ────────
DROP POLICY IF EXISTS scheduled_messages_delete ON zapp.scheduled_messages;
CREATE POLICY scheduled_messages_delete ON zapp.scheduled_messages
  FOR DELETE TO authenticated
  USING (
    created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
    OR zapp.is_contact_visible_to_user(contact_id, auth.uid())
  );

-- ── [C5] Índice composto para o polling do dispatcher ──────────────────────
-- Contrato aceita (scheduled_at, status) — cobre WHERE status='pending'
-- AND scheduled_at <= now().
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_at_status
  ON zapp.scheduled_messages (scheduled_at, status);

-- Duplicata órfã (drift live, inexistente no repo): mesma definição do
-- idx_scheduled_messages_due (scheduled_at) WHERE status='pending'.
DROP INDEX IF EXISTS zapp.idx_scheduled_messages_pending;

-- ── [C2] Dispatcher do CONTRATO (substitui a versão claim 'sending') ───────
-- A versão aplicada em 20260817250000 tinha assinatura (p_batch_limit
-- integer DEFAULT 20) e corpo com claim status='sending' + HTTP síncrono.
-- O contrato C2b/C3 exige: UPDATE atômico SET status='sent' ... WHERE
-- status='pending' AND scheduled_at <= now() RETURNING * (claim = envio,
-- no MESMO statement → idempotente por construção; sem estado 'sending').
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

-- Interna (cron roda como postgres): nada de exposição via PostgREST.
REVOKE EXECUTE ON FUNCTION zapp.fn_dispatch_scheduled_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_dispatch_scheduled_messages() TO postgres;

-- ── Cron (65.4, padrão campanhas-14): re-registro idempotente com o novo
--      comando zero-arg (o job 526 ainda chama `fn_dispatch_scheduled_messages(20)`) ──
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

  RAISE NOTICE '[etapa65] cron "scheduled-messages-dispatch" re-registrado (* * * * * UTC)';
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '[etapa65] erro ao registrar cron dispatcher [%]: %', SQLSTATE, SQLERRM;
END $$;

-- ── Canário (read-only, forma válida: set_config — a versão antiga usou
--      `SET LOCAL request.jwt.claims = json_build_object(...)`, sintaxe
--      inválida, e foi pulada no apply) ─────────────────────────────────────
DO $$
DECLARE
  v_fake uuid := '00000000-0000-0000-0000-00000000dead';
  v_rows bigint;
  v_policies integer;
  v_idx integer;
BEGIN
  SELECT count(*) INTO v_policies
    FROM pg_policies
   WHERE schemaname = 'zapp' AND tablename = 'scheduled_messages'
     AND cmd IN ('SELECT','INSERT','UPDATE','DELETE')
     AND 'authenticated' = ANY(roles);
  IF v_policies < 4 THEN
    RAISE EXCEPTION '[etapa65-contrato] canário falhou: % policies authenticated (esperado >= 4)', v_policies;
  END IF;

  SELECT count(*) INTO v_idx
    FROM pg_indexes
   WHERE schemaname = 'zapp' AND tablename = 'scheduled_messages'
     AND indexdef LIKE '%(scheduled_at, status)%';
  IF v_idx = 0 THEN
    RAISE EXCEPTION '[etapa65-contrato] canário falhou: índice (scheduled_at, status) ausente';
  END IF;

  -- RLS negativo (SELECT): usuário fake sem perfil não enxerga nada.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_fake, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_rows FROM zapp.scheduled_messages;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION '[etapa65-contrato] canário falhou: usuário fake enxergou % rows (esperado 0)', v_rows;
  END IF;
  RESET ROLE;

  RAISE NOTICE '[etapa65-contrato] canário OK: policies=%, idx=%, rows_fake_user=%', v_policies, v_idx, v_rows;
END $$;

COMMIT;

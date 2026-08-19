-- =============================================================================
-- 20260817220000_followup_complete_rpc_status_check.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- G8 — Religar follow-up na UI (edge `followup-bridge` sem consumidor).
--
-- 1. ALARGA o CHECK de status de `zapp.evolution_followups` (aditivo — nenhum
--    valor removido):
--      + 'triggered' — escrito por `zapp.fn_process_pending_followups`
--        (status IN ('pending','scheduled') AND scheduled_at <= now → triggered);
--        o CHECK atual NÃO inclui 'triggered' → UPDATE violaria a constraint
--        (bug latente no prod com 0 rows; alinhar DB × motor).
--      + 'completed' — conclusão manual via painel da UI (novo RPC abaixo).
--    O motor (cron `evolution-followup`) só reclama status IN
--    ('pending','scheduled') AND scheduled_at <= now → rows 'completed' são
--    ignoradas por design.
--
-- 2. CRIA `zapp.rpc_complete_followup(uuid)` — SECURITY DEFINER com search_path
--    fixo e gate `zapp.fn_require_app_user()` (padrão `rpc_schedule_follow_up`).
--    A tabela tem RLS SELECT-only para authenticated → UPDATE só via RPC.
--
-- 3. GRANT EXECUTE TO authenticated (padrão dos demais rpc_* de front,
--    ver 20260807091000_grant_execute_frontend_rpcs.sql).
--
-- Idempotente: CREATE OR REPLACE + DROP/ADD CONSTRAINT com IF EXISTS.
-- =============================================================================

-- ── 1. CHECK de status alargado ──────────────────────────────────────────────
ALTER TABLE zapp.evolution_followups
  DROP CONSTRAINT IF EXISTS evolution_followups_status_check;

ALTER TABLE zapp.evolution_followups
  ADD CONSTRAINT evolution_followups_status_check
  CHECK (
    status IS NULL OR status IN (
      'scheduled', 'pending', 'triggered', 'sent',
      'delivered', 'completed', 'cancelled', 'failed'
    )
  );

-- ── 2. RPC de conclusão manual (painel "Follow-ups pendentes") ───────────────
CREATE OR REPLACE FUNCTION zapp.rpc_complete_followup(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  PERFORM zapp.fn_require_app_user();

  UPDATE zapp.evolution_followups
     SET status = 'completed',
         response_at = now()
   WHERE id = p_id
     AND status IN ('pending', 'scheduled', 'triggered')
   RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'completed', v_id IS NOT NULL);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

-- ── 3. Grant ao front ────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION zapp.rpc_complete_followup(uuid) TO authenticated; -- ignore-lint-ml008: guarda PERFORM zapp.fn_require_app_user() na linha 50

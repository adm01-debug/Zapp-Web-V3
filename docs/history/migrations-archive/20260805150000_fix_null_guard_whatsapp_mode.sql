-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260805150000_fix_null_guard_whatsapp_mode.sql
-- Purpose  : Fix NULL-bypass in zapp.rpc_set_whatsapp_mode (achado A3 da
--            auditoria de confirmação 2026-08-05 — rodada final 5 agentes):
--            `IF p_mode NOT IN ('official','unofficial')` — em SQL,
--            `NULL NOT IN (...)` = NULL → `IF NULL` = FALSE → RAISE nunca
--            dispara para p_mode = NULL. Admin autenticado poderia gravar
--            value = NULL em global_settings.
-- Verified : SELECT (NULL NOT IN ('official','unofficial')) → NULL (comprovado
--            em produção via MCP); fix aplicado e verificado em produção.
-- Idempotent: CREATE OR REPLACE.
-- Rollback  : restaurar def sem o guard (não recomendado).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION zapp.rpc_set_whatsapp_mode(p_mode text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT zapp.is_admin_or_supervisor(v_uid) THEN
    RAISE EXCEPTION 'forbidden: only admin/supervisor can change whatsapp_mode';
  END IF;

  -- NULL NOT IN (...) = NULL -> IF NULL = FALSE: guarda explícita contra NULL
  -- (achado A3 da auditoria de confirmação 2026-08-05)
  IF p_mode IS NULL OR p_mode NOT IN ('official', 'unofficial') THEN
    RAISE EXCEPTION 'invalid mode: % (allowed: official, unofficial)', p_mode;
  END IF;

  INSERT INTO zapp.global_settings (key, value, updated_by)
  VALUES ('whatsapp_mode', p_mode, v_uid)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  RETURN p_mode;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_set_whatsapp_mode(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_set_whatsapp_mode(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'rpc_set_whatsapp_mode'
     AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%p_mode IS NULL OR%'
  ) THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: guard NULL ausente em rpc_set_whatsapp_mode';
  END IF;
END $$;

COMMIT;

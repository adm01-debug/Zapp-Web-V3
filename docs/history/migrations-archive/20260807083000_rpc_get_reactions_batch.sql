-- ═══════════════════════════════════════════════════════════════════════
-- SECTION: 20260807083000_rpc_get_reactions_batch.sql
-- ═══════════════════════════════════════════════════════════════════════

-- DB-as-source: a RPC `zapp.rpc_get_reactions_batch` EXISTE no banco de
-- produção (aplicada manualmente em 2026-08-04) mas NUNCA foi versionada
-- no repo — drift DB×repo apontado pela revalidação QA15-A1 (2026-08-07):
-- um ambiente novo construído só das migrations ficaria SEM a RPC e o
-- frontend cairia no fallback `.in()` chunkado (funciona, mas degradado).
--
-- Corpo espelhado 1:1 do que roda no DB (pg_get_functiondef, 2026-08-07):
--   - LANGUAGE sql, STABLE, SECURITY DEFINER, search_path fixado em 'zapp';
--   - RLS-aware: visível se `zapp.is_contact_visible_to_user(...)` OU se a
--     reação é do próprio usuário (`zapp.get_profile_id_for_user(auth.uid())`);
--   - dependências: zapp.is_contact_visible_to_user e
--     zapp.get_profile_id_for_user (ambas existentes no DB).
--
-- Idempotente (CREATE OR REPLACE). No banco vivo é um no-op estrutural que
-- apenas REGISTRA a versão em schema_migrations.

CREATE OR REPLACE FUNCTION zapp.rpc_get_reactions_batch(p_message_ids uuid[])
 RETURNS TABLE(id uuid, message_id uuid, contact_id uuid, user_id uuid, emoji text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
  SELECT
    r.id,
    r.message_id,
    r.contact_id,
    r.user_id,
    r.emoji,
    r.created_at
  FROM zapp.message_reactions r
  WHERE r.message_id = ANY(p_message_ids)
    AND (
      zapp.is_contact_visible_to_user(r.contact_id, auth.uid())
      OR r.user_id = zapp.get_profile_id_for_user(auth.uid())
    )
  ORDER BY r.message_id, r.created_at DESC;
$function$
;

-- ── Post-apply validation ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'rpc_get_reactions_batch'
      AND n.nspname = 'zapp'
  ) THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: zapp.rpc_get_reactions_batch ausente';
  END IF;
  RAISE NOTICE 'OK: zapp.rpc_get_reactions_batch presente e versionada';
END $$;

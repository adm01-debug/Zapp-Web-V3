-- ============================================================================
-- FIX PERF (2026-08-18) — zapp.rpc_list_messages_lite
-- ----------------------------------------------------------------------------
-- Elimina o OR generico ($N IS NULL OR created_at < $N) que impedia Index Cond
-- em created_at na paginacao (virava Filter no heap). Branchs explicitos por
-- (p_before_date NULL/not NULL) x (p_instance NULL/not NULL) — mesmo plano ja
-- provado via EXPLAIN (1.5-1.7ms nos ramos, index scan por partição).
-- Contrato preservado: (p_remote_jid text, p_instance text DEFAULT NULL,
-- p_limit int DEFAULT 50, p_offset int DEFAULT 0,
-- p_before_date timestamptz DEFAULT NULL) RETURNS SETOF evo.evolution_messages.
-- Guard fn_require_app_user() mantido. Idempotente (CREATE OR REPLACE).
-- ============================================================================
CREATE OR REPLACE FUNCTION zapp.rpc_list_messages_lite(
  p_remote_jid text,
  p_instance text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_before_date timestamp with time zone DEFAULT NULL::timestamp with time zone
)
 RETURNS SETOF evo.evolution_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_temp'
AS $function$
DECLARE
  v_limit   int := GREATEST(COALESCE(p_limit,  50), 0);
  v_offset  int := GREATEST(COALESCE(p_offset,  0), 0);
BEGIN
  PERFORM zapp.fn_require_app_user();
  IF p_before_date IS NULL THEN
    IF p_instance IS NOT NULL THEN
      RETURN QUERY EXECUTE
        'SELECT * FROM zapp.evolution_messages
         WHERE remote_jid   = $1
           AND instance_name = $2
           AND deleted_at   IS NULL
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4'
      USING p_remote_jid, p_instance, v_limit, v_offset;
    ELSE
      RETURN QUERY EXECUTE
        'SELECT * FROM zapp.evolution_messages
         WHERE remote_jid = $1
           AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3'
      USING p_remote_jid, v_limit, v_offset;
    END IF;
  ELSE
    IF p_instance IS NOT NULL THEN
      RETURN QUERY EXECUTE
        'SELECT * FROM zapp.evolution_messages
         WHERE remote_jid   = $1
           AND instance_name = $2
           AND deleted_at   IS NULL
           AND created_at   < $3
         ORDER BY created_at DESC
         LIMIT $4 OFFSET $5'
      USING p_remote_jid, p_instance, p_before_date, v_limit, v_offset;
    ELSE
      RETURN QUERY EXECUTE
        'SELECT * FROM zapp.evolution_messages
         WHERE remote_jid = $1
           AND deleted_at IS NULL
           AND created_at < $2
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4'
      USING p_remote_jid, p_before_date, v_limit, v_offset;
    END IF;
  END IF;
END;
$function$;

-- Reforco de privilegios (idempotente): so authenticated (app) e service_role.
REVOKE ALL ON FUNCTION zapp.rpc_list_messages_lite(text, text, integer, integer, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_list_messages_lite(text, text, integer, integer, timestamp with time zone) TO authenticated, service_role;

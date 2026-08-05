-- ============================================================================
-- Migration: restore_edge_idempotency_rpcs
-- Data:      2026-08-04
-- Objetivo:  RESTAURAR RPCs + tabelas de idempotência/telemetria do ai-router
--            removidas pela limpeza massiva (ebf9558d5, 984 arquivos).
--
-- GAP ENCONTRADO NA VALIDAÇÃO EXAUSTIVA 2026-08-04 (5 agentes + orquestrador):
--   zapp.processed_requests, zapp.ai_function_metrics e as RPCs
--   acquire_idempotency_lock / check_duplicate_request / record_processed_request
--   / record_ai_metrics / upsert_conversation_tags_atomic / sicoob_outbox_claim
--   NÃO existiam no banco — o ai-router (produção) chama acquire_idempotency_lock
--   (linha 616) e check_duplicate_request (linha 635) com fallback silencioso:
--   a idempotência de requests de IA NUNCA funcionou em produção desde o
--   Improvement 6 (12/07) e as métricas de IA nunca foram gravadas.
--
-- FONTE: migration archive/20260725000005_create_missing_edge_function_rpcs.sql
-- (commit ebf9558d5^) — definições canônicas escritas para createZappAdminClient
-- (rota .rpc() para schema zapp).
--
-- CORREÇÃO vs FONTE ANTIGA: os índices parciais originais usavam
--   WHERE expires_at < now()  (now() é VOLATILE → PostgreSQL rejeita em index
--   predicate: "functions in index predicate must be marked IMMUTABLE").
--   Substituídos por índices simples (expires_at) e (user_id, contact_id).
--   Aplicada em produção como 20260804210923.
--
-- IDEMPOTENTE: CREATE OR REPLACE + DO $$ (tabelas com IF NOT EXISTS).
-- ============================================================================

-- ── 1. record_ai_metrics + tabela ai_function_metrics ───────────────────────
-- Used by: ai-router (linha ~472) — telemetria não-crítica (swallow errors).
CREATE OR REPLACE FUNCTION zapp.record_ai_metrics(
  p_function_name  TEXT,
  p_action         TEXT,
  p_duration_ms    INTEGER,
  p_status         TEXT,
  p_user_id        UUID,
  p_error_message  TEXT DEFAULT NULL,
  p_metadata       JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  INSERT INTO zapp.ai_function_metrics (
    function_name, action, duration_ms, status, user_id, error_message, metadata
  ) VALUES (
    p_function_name, p_action, p_duration_ms,
    COALESCE(p_status, 'success'), p_user_id, p_error_message, p_metadata
  );
EXCEPTION WHEN OTHERS THEN
  -- Non-critical telemetry — swallow all errors
  NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.record_ai_metrics(TEXT,TEXT,INTEGER,TEXT,UUID,TEXT,JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.record_ai_metrics(TEXT,TEXT,INTEGER,TEXT,UUID,TEXT,JSONB) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ai_function_metrics' AND n.nspname = 'zapp'
  ) THEN
    EXECUTE $ddl$
      CREATE TABLE zapp.ai_function_metrics (
        id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        function_name TEXT        NOT NULL,
        action        TEXT        NOT NULL,
        duration_ms   INTEGER     NOT NULL DEFAULT 0,
        status        TEXT        NOT NULL DEFAULT 'success',
        user_id       UUID,
        error_message TEXT,
        metadata      JSONB,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    $ddl$;
    EXECUTE $ddl$
      CREATE INDEX ON zapp.ai_function_metrics (created_at)
    $ddl$;
    RAISE NOTICE 'created zapp.ai_function_metrics';
  END IF;
END;
$$;

REVOKE ALL ON zapp.ai_function_metrics FROM PUBLIC, anon;
GRANT SELECT, INSERT ON zapp.ai_function_metrics TO authenticated;
GRANT ALL ON zapp.ai_function_metrics TO service_role;

-- ── 2. Tabela processed_requests (base da idempotência) ─────────────────────
-- Mirror de public.processed_requests em zapp (createZappAdminClient roteia
-- .rpc() para zapp; a versão public era inalcançável — PGRST202).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'processed_requests' AND n.nspname = 'zapp'
  ) THEN
    EXECUTE $ddl$
      CREATE TABLE zapp.processed_requests (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id     TEXT        NOT NULL,
        action         TEXT        NOT NULL,
        user_id        UUID        NOT NULL,
        contact_id     UUID,
        result_status  INTEGER     NOT NULL DEFAULT 200,
        result_payload JSONB,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at     TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
        UNIQUE (request_id, action)
      )
    $ddl$;
    EXECUTE $ddl$
      CREATE INDEX ON zapp.processed_requests (expires_at)
    $ddl$;
    EXECUTE $ddl$
      CREATE INDEX ON zapp.processed_requests (user_id, contact_id)
    $ddl$;
    RAISE NOTICE 'created zapp.processed_requests';
  END IF;
END;
$$;

REVOKE ALL ON zapp.processed_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON zapp.processed_requests TO authenticated;
GRANT ALL ON zapp.processed_requests TO service_role;

-- ── 3. check_duplicate_request ──────────────────────────────────────────────
-- Used by: ai-router (polling de duplicata após acquire falhar).
CREATE OR REPLACE FUNCTION zapp.check_duplicate_request(
  p_request_id TEXT,
  p_action     TEXT,
  p_user_id    UUID
) RETURNS TABLE (
  is_duplicate   BOOLEAN,
  status_code    INTEGER,
  cached_result  JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_rec zapp.processed_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_rec
  FROM   zapp.processed_requests
  WHERE  request_id = p_request_id
    AND  action     = p_action
    AND  user_id    = p_user_id
    AND  expires_at > now()
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, v_rec.result_status, v_rec.result_payload;
  ELSE
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::JSONB;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.check_duplicate_request(TEXT,TEXT,UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.check_duplicate_request(TEXT,TEXT,UUID) TO authenticated, service_role;

-- ── 4. record_processed_request (5 params — assinatura usada pelo ai-router) ─
CREATE OR REPLACE FUNCTION zapp.record_processed_request(
  p_request_id     TEXT,
  p_action         TEXT,
  p_user_id        UUID,
  p_status_code    INTEGER,
  p_result_payload JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  INSERT INTO zapp.processed_requests (
    request_id, action, user_id, result_status, result_payload, expires_at
  ) VALUES (
    p_request_id, p_action, p_user_id,
    p_status_code, p_result_payload, now() + INTERVAL '5 minutes'
  )
  ON CONFLICT (request_id, action) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Non-critical — swallow
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.record_processed_request(TEXT,TEXT,UUID,INTEGER,JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.record_processed_request(TEXT,TEXT,UUID,INTEGER,JSONB) TO authenticated, service_role;

-- ── 5. acquire_idempotency_lock ──────────────────────────────────────────────
-- Used by: ai-router (linha ~616). Insert-atômico; unique_violation = duplicata.
CREATE OR REPLACE FUNCTION zapp.acquire_idempotency_lock(
  p_request_id TEXT,
  p_action     TEXT,
  p_user_id    UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_inserted BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO zapp.processed_requests (request_id, action, user_id, expires_at)
    VALUES (p_request_id, p_action, p_user_id, now() + INTERVAL '5 minutes');
    v_inserted := TRUE;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := FALSE;
  END;

  RETURN jsonb_build_object('acquired', v_inserted);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.acquire_idempotency_lock(TEXT,TEXT,UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.acquire_idempotency_lock(TEXT,TEXT,UUID) TO authenticated, service_role;

-- ── 6. upsert_conversation_tags_atomic ──────────────────────────────────────
-- Used by: ai-router (linha ~1385) — tags de conversa com dedupe/delete.
CREATE OR REPLACE FUNCTION zapp.upsert_conversation_tags_atomic(
  p_contact_id UUID,
  p_new_tags   JSONB,
  p_old_tags   JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  INSERT INTO zapp.ai_conversation_tags (contact_id, tag_name, confidence, source)
  SELECT p_contact_id, (tag->>'name'), (tag->>'confidence')::numeric, COALESCE(tag->>'source', 'ai')
  FROM jsonb_array_elements(p_new_tags) AS tag
  WHERE tag->>'name' IS NOT NULL
  ON CONFLICT (contact_id, tag_name) DO UPDATE SET
    confidence = EXCLUDED.confidence,
    updated_at = now();

  IF p_old_tags IS NOT NULL THEN
    DELETE FROM zapp.ai_conversation_tags
    WHERE contact_id = p_contact_id
      AND tag_name NOT IN (SELECT tag->>'name' FROM jsonb_array_elements(p_old_tags) AS tag);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.upsert_conversation_tags_atomic(UUID,JSONB,JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.upsert_conversation_tags_atomic(UUID,JSONB,JSONB) TO authenticated, service_role;

-- ── 7. sicoob_outbox_claim ──────────────────────────────────────────────────
-- Used by: sicoob-outbox-consumer (claim com SKIP LOCKED).
CREATE OR REPLACE FUNCTION zapp.sicoob_outbox_claim(
  p_batch_size INT DEFAULT 10
) RETURNS TABLE (
  id          UUID,
  payload     JSONB,
  status      TEXT,
  attempt_count INT,
  next_attempt_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT s.id
    FROM   zapp.sicoob_reply_outbox s
    WHERE  s.status = 'pending'
      AND  (s.next_attempt_at IS NULL OR s.next_attempt_at <= now())
    ORDER BY s.created_at ASC
    LIMIT  p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE zapp.sicoob_reply_outbox s
  SET    status = 'processing',
         attempt_count = attempt_count + 1,
         next_attempt_at = now() + INTERVAL '1 minute'
  FROM   claimed
  WHERE  s.id = claimed.id
  RETURNING s.id, s.payload, s.status, s.attempt_count, s.next_attempt_at, s.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.sicoob_outbox_claim(INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.sicoob_outbox_claim(INT) TO service_role;

-- ============================================================================
-- FIM — idempotência/telemetria do ai-router restaurada (2026-08-04).
-- Validada em produção: acquire→true, acquire duplicado→false, check→duplicata.
-- ============================================================================

-- Migration: Create missing RPCs called by edge functions (BUG-43)
--
-- Problem: 13 functions called via createZappAdminClient().rpc() in edge functions
-- have no implementation in the zapp schema → PGRST202 at runtime.
--
-- Functions created here:
--   ai-router            → record_ai_metrics, check_duplicate_request,
--                          record_processed_request, acquire_idempotency_lock,
--                          upsert_conversation_tags_atomic, get_all_table_names
--   evolution-sentiment  → fn_analyze_sentiment
--   evolution-templates  → fn_get_vault_secret
--   email-track-link     → rpc_email_register_click
--   sicoob-outbox-consumer → sicoob_outbox_claim
--
-- Supporting tables created:
--   zapp.ai_function_metrics   — AI call telemetry (record_ai_metrics target)
--   zapp.processed_requests    — Idempotency dedup cache (5 min TTL)
--   zapp.email_tracked_links   — Link → URL registry for email click tracking
--
-- All functions: SECURITY DEFINER, SET search_path = zapp, revoke from public/anon.

-- ── 1. Supporting table: ai_function_metrics ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ai_function_metrics' AND n.nspname = 'zapp'
  ) THEN
    EXECUTE $ddl$
      CREATE TABLE zapp.ai_function_metrics (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        function_name TEXT       NOT NULL,
        action        TEXT,
        duration_ms   INTEGER    NOT NULL,
        status        TEXT       NOT NULL
                        CHECK (status IN ('success','error','timeout','circuit_open')),
        user_id       UUID,
        error_message TEXT,
        metadata      JSONB,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    $ddl$;
    EXECUTE $ddl$
      CREATE INDEX ON zapp.ai_function_metrics (function_name, created_at DESC)
    $ddl$;
    EXECUTE $ddl$
      CREATE INDEX ON zapp.ai_function_metrics (status, created_at DESC)
    $ddl$;
    RAISE NOTICE 'created zapp.ai_function_metrics';
  END IF;
END;
$$;

ALTER TABLE IF EXISTS zapp.ai_function_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='zapp' AND tablename='ai_function_metrics'
    AND policyname='ai_function_metrics_admin_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "ai_function_metrics_admin_select"
        ON zapp.ai_function_metrics FOR SELECT
        USING (zapp.is_admin_or_supervisor(auth.uid()))
    $p$;
  END IF;
END;
$$;

REVOKE ALL ON zapp.ai_function_metrics FROM PUBLIC, anon;
GRANT SELECT, INSERT ON zapp.ai_function_metrics TO authenticated;
GRANT ALL ON zapp.ai_function_metrics TO service_role;

-- ── 2. record_ai_metrics ──────────────────────────────────────────────────────
-- Used by: ai-router (non-critical; ~15 call sites)
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

-- ── 3. Supporting table: processed_requests ───────────────────────────────────
-- Mirror of public.processed_requests (migration 20260712_p1) but in zapp schema.
-- createZappAdminClient() routes all rpc() calls to zapp, so the existing public
-- version was unreachable (PGRST202).
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
        WHERE expires_at < now()
    $ddl$;
    EXECUTE $ddl$
      CREATE INDEX ON zapp.processed_requests (user_id, contact_id)
        WHERE expires_at > now()
    $ddl$;
    RAISE NOTICE 'created zapp.processed_requests';
  END IF;
END;
$$;

REVOKE ALL ON zapp.processed_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON zapp.processed_requests TO authenticated;
GRANT ALL ON zapp.processed_requests TO service_role;

-- ── 4. check_duplicate_request ────────────────────────────────────────────────
-- Used by: ai-router (acquire_idempotency_lock fallback polling)
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

-- ── 5. record_processed_request (5-param) ────────────────────────────────────
-- Used by: ai-router line ~465 (5 params, no p_contact_id)
-- The public schema version has 6 params; this 5-param version matches the call.
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

-- ── 6. acquire_idempotency_lock ───────────────────────────────────────────────
-- Used by: ai-router (line ~609)
-- Returns JSONB: {acquired: true} if new request, {acquired: false} if duplicate.
-- Uses INSERT ... ON CONFLICT to atomically detect duplicates.
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
  -- Attempt atomic insert; conflict = duplicate in-flight request
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

-- ── 7. upsert_conversation_tags_atomic ────────────────────────────────────────
-- Used by: ai-router (line ~1385)
-- p_new_tags: JSON array string of [{name, confidence}] objects
-- Manages zapp.ai_conversation_tags: insert new tags, optionally delete stale.
CREATE OR REPLACE FUNCTION zapp.upsert_conversation_tags_atomic(
  p_contact_id        UUID,
  p_new_tags          TEXT,
  p_should_delete_stale BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_tag     JSONB;
  v_tags    JSONB;
  v_name    TEXT;
  v_conf    NUMERIC;
  v_names   TEXT[];
  v_upserted INTEGER := 0;
  v_deleted  INTEGER := 0;
BEGIN
  -- Parse JSON array
  BEGIN
    v_tags := p_new_tags::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'invalid JSON: ' || SQLERRM);
  END;

  IF jsonb_typeof(v_tags) <> 'array' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'p_new_tags must be a JSON array');
  END IF;

  -- Upsert each tag
  FOR v_tag IN SELECT * FROM jsonb_array_elements(v_tags)
  LOOP
    v_name := TRIM(LEFT(v_tag->>'name', 100));
    v_conf := COALESCE((v_tag->>'confidence')::NUMERIC, 0.0);
    v_conf := LEAST(GREATEST(v_conf, 0.0), 1.0);

    IF v_name IS NULL OR v_name = '' THEN CONTINUE; END IF;

    INSERT INTO zapp.ai_conversation_tags (contact_id, tag_name, confidence, source)
    VALUES (p_contact_id, v_name, v_conf, 'ai')
    ON CONFLICT (contact_id, tag_name)
    DO UPDATE SET confidence = EXCLUDED.confidence, created_at = now();

    v_names  := array_append(v_names, v_name);
    v_upserted := v_upserted + 1;
  END LOOP;

  -- Delete stale tags not in the new set
  IF p_should_delete_stale AND array_length(v_names, 1) IS NOT NULL THEN
    DELETE FROM zapp.ai_conversation_tags
    WHERE contact_id = p_contact_id
      AND tag_name   <> ALL(v_names);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'upserted', v_upserted,
    'deleted', v_deleted
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.upsert_conversation_tags_atomic(UUID,TEXT,BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.upsert_conversation_tags_atomic(UUID,TEXT,BOOLEAN) TO authenticated, service_role;

-- Ensure UNIQUE constraint exists on ai_conversation_tags for the ON CONFLICT above
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'zapp' AND t.relname = 'ai_conversation_tags'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) LIKE '%contact_id%tag_name%'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE zapp.ai_conversation_tags ADD CONSTRAINT ai_conv_tags_contact_name_uq UNIQUE (contact_id, tag_name)';
      RAISE NOTICE 'added UNIQUE (contact_id, tag_name) on zapp.ai_conversation_tags';
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END;
$$;

-- ── 8. get_all_table_names ────────────────────────────────────────────────────
-- Used by: external-db-proxy ALLOWED_RPCS (audit / schema introspection)
CREATE OR REPLACE FUNCTION zapp.get_all_table_names()
RETURNS TABLE (table_name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT c.relname::TEXT
  FROM   pg_class c
  JOIN   pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'zapp'
    AND  c.relkind IN ('r', 'p')   -- regular + partitioned
  ORDER  BY c.relname;
$$;

REVOKE EXECUTE ON FUNCTION zapp.get_all_table_names() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.get_all_table_names() TO authenticated, service_role;

-- ── 9. fn_get_vault_secret ────────────────────────────────────────────────────
-- Used by: evolution-templates (line ~15-17), other edge functions
-- Reads decrypted secrets from vault.decrypted_secrets.
-- Returns NULL (not error) if secret not found — callers check for null.
CREATE OR REPLACE FUNCTION zapp.fn_get_vault_secret(
  p_name TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_value TEXT;
BEGIN
  SELECT decrypted_secret INTO v_value
  FROM   vault.decrypted_secrets
  WHERE  name = p_name
  LIMIT  1;

  RETURN v_value;
EXCEPTION WHEN OTHERS THEN
  -- vault extension may not be installed; return NULL gracefully
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.fn_get_vault_secret(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_get_vault_secret(TEXT) TO service_role;
-- Note: do NOT grant to authenticated — secrets are privileged

-- ── 10. fn_analyze_sentiment ──────────────────────────────────────────────────
-- Used by: evolution-sentiment/index.ts (line ~42)
-- Returns SETOF row: {sentiment, score, intent, urgency, keywords}
-- Keyword-rule engine; replaces a missing ML call when no AI backend configured.
CREATE OR REPLACE FUNCTION zapp.fn_analyze_sentiment(
  p_text TEXT
) RETURNS TABLE (
  sentiment TEXT,
  score     NUMERIC,
  intent    TEXT,
  urgency   TEXT,
  keywords  TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_text      TEXT  := LOWER(COALESCE(p_text, ''));
  v_sentiment TEXT  := 'neutral';
  v_score     NUMERIC := 0.0;
  v_intent    TEXT  := 'geral';
  v_urgency   TEXT  := 'low';
  v_keywords  TEXT[] := '{}';
  v_pos_hits  INT := 0;
  v_neg_hits  INT := 0;
BEGIN
  -- Positive signals
  IF v_text ~ '(ótimo|excelente|obrigad|satisf|bom|legal|parabéns|grat|funcio|perfeito|maravilhoso|adorei|amei)' THEN
    v_pos_hits := v_pos_hits + 1;
  END IF;
  IF v_text ~ '(resolvido|resolve|ok|sim|claro|com certeza|sucesso|aprovo)' THEN
    v_pos_hits := v_pos_hits + 1;
  END IF;

  -- Negative signals
  IF v_text ~ '(problema|erro|não funciona|ruim|péssimo|horrivel|insatisf|demora|lento|quebrado|bug|falha|travou)' THEN
    v_neg_hits := v_neg_hits + 1;
    v_keywords := array_append(v_keywords, 'problema');
  END IF;
  IF v_text ~ '(raiva|ódio|absurdo|inaceitável|decepcionante|decepcionado|revoltado|pior|nunca mais)' THEN
    v_neg_hits := v_neg_hits + 2;
    v_keywords := array_append(v_keywords, 'insatisfação');
  END IF;
  IF v_text ~ '(urgente|urgência|imediato|agora|socorro|ajuda|preciso|crit[íi]co)' THEN
    v_urgency  := 'high';
    v_keywords := array_append(v_keywords, 'urgente');
  END IF;

  -- Intent classification
  IF v_text ~ '(cancelar|cancelamento|rescis|desistir|desistência)' THEN
    v_intent := 'cancelamento';
    v_keywords := array_append(v_keywords, 'cancelamento');
  ELSIF v_text ~ '(comprar|contratar|adquirir|quero|pedido|cotaç|preço|valor|quanto custa)' THEN
    v_intent := 'compra';
  ELSIF v_text ~ '(reclamar|reclamação|denúncia|cobrança indevida|estorno)' THEN
    v_intent := 'reclamação';
    v_keywords := array_append(v_keywords, 'reclamação');
  ELSIF v_text ~ '(dúvida|ajuda|como|onde|quando|por que|suporte|informação)' THEN
    v_intent := 'suporte';
  END IF;

  -- Compute sentiment + score
  IF v_neg_hits > v_pos_hits THEN
    v_sentiment := 'negative';
    v_score     := -(LEAST(v_neg_hits, 5) * 0.2);
  ELSIF v_pos_hits > v_neg_hits THEN
    v_sentiment := 'positive';
    v_score     :=  LEAST(v_pos_hits, 5) * 0.2;
  END IF;

  -- Upgrade urgency for strong negatives
  IF v_neg_hits >= 2 AND v_urgency = 'low' THEN
    v_urgency := 'medium';
  END IF;

  RETURN QUERY SELECT v_sentiment, v_score, v_intent, v_urgency, v_keywords;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.fn_analyze_sentiment(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_analyze_sentiment(TEXT) TO authenticated, service_role;

-- ── 11. Supporting table: email_tracked_links ─────────────────────────────────
-- Each row maps a short link_id to its original destination URL.
-- Created alongside email campaigns; referenced by rpc_email_register_click.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'email_tracked_links' AND n.nspname = 'zapp'
  ) THEN
    EXECUTE $ddl$
      CREATE TABLE zapp.email_tracked_links (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        link_id      TEXT        NOT NULL UNIQUE,
        original_url TEXT        NOT NULL,
        tracking_id  TEXT,           -- FK-by-value to email_tracked_messages.tracking_id
        click_count  INTEGER     NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    $ddl$;
    EXECUTE $ddl$
      CREATE INDEX ON zapp.email_tracked_links (tracking_id)
    $ddl$;
    RAISE NOTICE 'created zapp.email_tracked_links';
  END IF;
END;
$$;

ALTER TABLE IF EXISTS zapp.email_tracked_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='zapp' AND tablename='email_tracked_links'
    AND policyname='email_tracked_links_auth'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "email_tracked_links_auth"
        ON zapp.email_tracked_links FOR ALL
        USING (TRUE)
    $p$;
  END IF;
END;
$$;

REVOKE ALL ON zapp.email_tracked_links FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON zapp.email_tracked_links TO authenticated;
GRANT ALL ON zapp.email_tracked_links TO service_role;

-- ── 12. rpc_email_register_click ──────────────────────────────────────────────
-- Used by: email-track-link/index.ts (line ~57)
-- Records a link click and returns the original URL for redirect.
-- Returns JSONB: {original_url} on success, {error} if link_id not found.
CREATE OR REPLACE FUNCTION zapp.rpc_email_register_click(
  p_link_id     TEXT,
  p_ip          TEXT    DEFAULT NULL,
  p_user_agent  TEXT    DEFAULT NULL,
  p_country     TEXT    DEFAULT NULL,
  p_city        TEXT    DEFAULT NULL,
  p_device_type TEXT    DEFAULT NULL,
  p_browser     TEXT    DEFAULT NULL,
  p_os          TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_link  zapp.email_tracked_links%ROWTYPE;
BEGIN
  -- Atomically increment click count and return original URL
  UPDATE zapp.email_tracked_links
  SET    click_count = click_count + 1,
         updated_at  = now()
  WHERE  link_id = p_link_id
  RETURNING * INTO v_link;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'link_not_found', 'link_id', p_link_id);
  END IF;

  -- Also bump the parent tracked message click telemetry (best-effort)
  BEGIN
    IF v_link.tracking_id IS NOT NULL THEN
      UPDATE zapp.email_tracked_messages
      SET    open_count   = open_count + 1,   -- reuse open_count as engagement counter
             updated_at   = now()
      WHERE  tracking_id  = v_link.tracking_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'original_url', v_link.original_url,
    'link_id',      v_link.link_id,
    'click_count',  v_link.click_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_email_register_click(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_email_register_click(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
-- No authenticated grant — only the edge function (service_role) may record clicks

-- ── 13. sicoob_outbox_claim ───────────────────────────────────────────────────
-- Used by: sicoob-outbox-consumer/index.ts (line ~60)
-- Atomically claims up to p_limit pending/failed outbox items.
-- Uses FOR UPDATE SKIP LOCKED to prevent concurrent consumer overlap.
CREATE OR REPLACE FUNCTION zapp.sicoob_outbox_claim(
  p_limit INT DEFAULT 25
) RETURNS TABLE (
  id              UUID,
  contact_id      UUID,
  message_id      UUID,
  agent_id        UUID,
  content         TEXT,
  status          TEXT,
  attempts        INTEGER,
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN QUERY
    UPDATE zapp.sicoob_reply_outbox o
    SET    status          = 'processing',
           attempts        = o.attempts + 1,
           updated_at      = now()
    WHERE  o.id IN (
      SELECT s.id
      FROM   zapp.sicoob_reply_outbox s
      WHERE  s.status IN ('pending', 'failed')
        AND  s.next_attempt_at <= now()
        AND  s.attempts < 6           -- MAX_ATTEMPTS from edge function
      ORDER  BY s.next_attempt_at ASC
      LIMIT  p_limit
      FOR    UPDATE SKIP LOCKED
    )
    RETURNING
      o.id, o.contact_id, o.message_id, o.agent_id, o.content,
      o.status, o.attempts, o.last_error, o.next_attempt_at,
      o.processed_at, o.created_at, o.updated_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.sicoob_outbox_claim(INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.sicoob_outbox_claim(INT) TO service_role;
-- No authenticated grant — only the cron-invoked edge function may claim items

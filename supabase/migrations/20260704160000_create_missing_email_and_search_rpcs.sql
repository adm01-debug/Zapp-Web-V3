-- =============================================================================
-- Create missing RPCs referenced in frontend code but absent from DB
-- Idempotente: CREATE OR REPLACE — seguro para re-aplicar.
-- RPCs criados como stubs funcionais que retornam dados em branco/defaults;
-- a lógica real pode ser preenchida gradualmente sem quebrar o frontend.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- rpc_get_email_health_summary
--   Lê o estado atual de saúde do serviço de email da tabela email_health_summary.
--   Chamado por: src/services/email/emailHealthRepository.ts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_email_health_summary()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.email_health_summary%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.email_health_summary WHERE id = 'current' LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'healthy',
      'last_validation', now(),
      'failure_count_60m', 0,
      'metadata', '{}'::jsonb,
      'updated_at', now()
    );
  END IF;
  RETURN jsonb_build_object(
    'status', v_row.status,
    'last_validation', v_row.last_validation,
    'failure_count_60m', v_row.failure_count_60m,
    'metadata', COALESCE(v_row.metadata, '{}'::jsonb),
    'updated_at', v_row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_email_health_summary() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rpc_update_email_health_state
--   Atualiza o estado de saúde do serviço de email; chamado pelo safeClient.
--   Chamado por: src/integrations/supabase/safeClient.ts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_email_health_state(
  p_status       text,
  p_failure_count integer DEFAULT 0,
  p_metadata     jsonb    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  -- Normalise status to allowed domain
  v_status := CASE
    WHEN p_status IN ('healthy', 'degraded', 'error', 'unknown') THEN p_status
    WHEN p_status = 'ok' THEN 'healthy'
    ELSE 'unknown'
  END;

  INSERT INTO public.email_health_summary (id, status, failure_count_60m, metadata, updated_at)
  VALUES ('current', v_status, COALESCE(p_failure_count, 0), COALESCE(p_metadata, '{}'::jsonb), now())
  ON CONFLICT (id) DO UPDATE
    SET status           = EXCLUDED.status,
        failure_count_60m = EXCLUDED.failure_count_60m,
        metadata         = EXCLUDED.metadata,
        updated_at       = now();

  RETURN jsonb_build_object('ok', true, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_email_health_state(text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_email_health_state(text, integer, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rpc_email_star_thread
--   Marca/desmarca uma thread de email como starred.
--   Chamado por: src/hooks/useEmail.ts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_email_star_thread(
  p_thread_id text,
  p_starred   boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'email_app'
AS $$
BEGIN
  -- Attempt to update in email_app schema (Gmail threads live there)
  UPDATE email_app.email_threads
    SET is_starred = p_starred,
        updated_at = now()
  WHERE id::text = p_thread_id;

  -- Fallback: also try public schema if table exists there
  BEGIN
    UPDATE public.email_threads
      SET is_starred = p_starred,
          updated_at = now()
    WHERE id::text = p_thread_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'thread_id', p_thread_id, 'starred', p_starred);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_email_star_thread(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_email_star_thread(text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rpc_email_tracking_stats
--   Retorna estatísticas agregadas de rastreio de emails para os últimos N dias.
--   Chamado por: src/hooks/useEmailTracking.ts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_email_tracking_stats(
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'email_app'
AS $$
DECLARE
  v_stats jsonb;
  v_since timestamptz := now() - (COALESCE(LEAST(GREATEST(p_days, 1), 365), 30) * interval '1 day');
BEGIN
  -- Try to aggregate from email_tracking_events if it exists
  BEGIN
    SELECT jsonb_build_object(
      'total_tracked',       COUNT(DISTINCT tracking_id),
      'total_opens',         COUNT(*) FILTER (WHERE event_type = 'open'),
      'total_clicks',        COUNT(*) FILTER (WHERE event_type = 'click'),
      'unique_opens',        COUNT(DISTINCT CASE WHEN event_type = 'open' THEN tracking_id END),
      'open_rate',           ROUND(
                               CASE WHEN COUNT(DISTINCT tracking_id) > 0
                                    THEN COUNT(DISTINCT CASE WHEN event_type = 'open' THEN tracking_id END)::numeric
                                         / COUNT(DISTINCT tracking_id)::numeric
                               ELSE 0 END, 4),
      'click_rate',          ROUND(
                               CASE WHEN COUNT(DISTINCT tracking_id) > 0
                                    THEN COUNT(DISTINCT CASE WHEN event_type = 'click' THEN tracking_id END)::numeric
                                         / COUNT(DISTINCT tracking_id)::numeric
                               ELSE 0 END, 4),
      'bounce_count',        COUNT(*) FILTER (WHERE event_type = 'bounce'),
      'avg_opens_per_email', ROUND(
                               CASE WHEN COUNT(DISTINCT tracking_id) > 0
                                    THEN COUNT(*) FILTER (WHERE event_type = 'open')::numeric
                                         / COUNT(DISTINCT tracking_id)::numeric
                               ELSE 0 END, 2),
      'period_days',         COALESCE(p_days, 30)
    ) INTO v_stats
    FROM email_app.email_tracking_events
    WHERE created_at >= v_since;
  EXCEPTION WHEN undefined_table THEN
    v_stats := NULL;
  END;

  IF v_stats IS NULL THEN
    BEGIN
      SELECT jsonb_build_object(
        'total_tracked', COUNT(DISTINCT tracking_id),
        'total_opens',   COUNT(*) FILTER (WHERE event_type = 'open'),
        'total_clicks',  COUNT(*) FILTER (WHERE event_type = 'click'),
        'unique_opens',  COUNT(DISTINCT CASE WHEN event_type = 'open' THEN tracking_id END),
        'open_rate', 0, 'click_rate', 0, 'bounce_count', 0,
        'avg_opens_per_email', NULL,
        'period_days', COALESCE(p_days, 30)
      ) INTO v_stats
      FROM public.email_tracking_events
      WHERE created_at >= v_since;
    EXCEPTION WHEN undefined_table THEN
      v_stats := jsonb_build_object(
        'total_tracked', 0, 'total_opens', 0, 'total_clicks', 0,
        'unique_opens', 0, 'open_rate', 0, 'click_rate', 0,
        'bounce_count', 0, 'avg_opens_per_email', null, 'period_days', COALESCE(p_days, 30)
      );
    END;
  END IF;

  RETURN v_stats;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_email_tracking_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_email_tracking_stats(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rpc_email_top_contacts
--   Retorna os top N contatos por engajamento (opens + clicks) de emails rastreados.
--   Chamado por: src/hooks/useEmailTracking.ts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_email_top_contacts(
  p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'email_app'
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
  v_result jsonb;
BEGIN
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result FROM (
      SELECT
        COALESCE(recipient_email, 'unknown')  AS email,
        MAX(recipient_name)                   AS display_name,
        COUNT(*) FILTER (WHERE event_type IN ('open','click')) AS engagement_score,
        COUNT(*) FILTER (WHERE event_type = 'open')           AS total_opens,
        COUNT(*) FILTER (WHERE event_type = 'click')          AS total_clicks,
        MAX(created_at)                                        AS last_interaction
      FROM email_app.email_tracking_events
      WHERE recipient_email IS NOT NULL
      GROUP BY recipient_email
      ORDER BY engagement_score DESC
      LIMIT v_limit
    ) t;
  EXCEPTION WHEN undefined_table THEN
    v_result := '[]'::jsonb;
  END;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_email_top_contacts(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_email_top_contacts(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rpc_search_insights
--   Retorna métricas agregadas dos logs de busca para os últimos N dias.
--   Chamado por: src/hooks/useSearchInsights.ts
--   Depende das tabelas criadas por rpc_log_search_event e rpc_record_search_click
--   (search_events / search_clicks). Retorna zeros se as tabelas não existirem.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_search_insights(
  p_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days   integer   := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_since  timestamptz := now() - (v_days * interval '1 day');
  v_total_searches  bigint   := 0;
  v_unique_queries  bigint   := 0;
  v_vector_searches bigint   := 0;
  v_total_clicks    bigint   := 0;
  v_zero_results    bigint   := 0;
  v_avg_results     numeric  := 0;
  v_top_queries     jsonb    := '[]'::jsonb;
  v_zero_queries    jsonb    := '[]'::jsonb;
BEGIN
  -- Try to read from search_events table (may not exist yet)
  BEGIN
    SELECT
      COUNT(*)                                        INTO v_total_searches
    FROM public.search_events
    WHERE created_at >= v_since;

    SELECT COUNT(DISTINCT query)                      INTO v_unique_queries
    FROM public.search_events
    WHERE created_at >= v_since;

    SELECT COUNT(*)                                   INTO v_vector_searches
    FROM public.search_events
    WHERE created_at >= v_since AND is_vector IS TRUE;

    SELECT COALESCE(AVG(result_count), 0)             INTO v_avg_results
    FROM public.search_events
    WHERE created_at >= v_since;

    SELECT COUNT(*)                                   INTO v_zero_results
    FROM public.search_events
    WHERE created_at >= v_since AND result_count = 0;

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_queries FROM (
      SELECT query, COUNT(*) AS count, ROUND(AVG(result_count), 1) AS avg_results
      FROM public.search_events
      WHERE created_at >= v_since
      GROUP BY query ORDER BY count DESC LIMIT 10
    ) t;

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_zero_queries FROM (
      SELECT query, COUNT(*) AS count, MAX(created_at)::text AS last_at
      FROM public.search_events
      WHERE created_at >= v_since AND result_count = 0
      GROUP BY query ORDER BY count DESC LIMIT 10
    ) t;
  EXCEPTION WHEN undefined_table THEN
    NULL; -- leave zeros
  END;

  -- Try to read clicks from search_clicks table
  BEGIN
    SELECT COUNT(*) INTO v_total_clicks FROM public.search_clicks WHERE created_at >= v_since;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'total_searches',    v_total_searches,
    'unique_queries',    v_unique_queries,
    'vector_searches',   v_vector_searches,
    'vector_share',      CASE WHEN v_total_searches > 0
                              THEN ROUND(v_vector_searches::numeric / v_total_searches::numeric, 4)
                         ELSE 0 END,
    'total_clicks',      v_total_clicks,
    'click_through_rate', CASE WHEN v_total_searches > 0
                               THEN ROUND(v_total_clicks::numeric / v_total_searches::numeric, 4)
                          ELSE 0 END,
    'zero_result_count', v_zero_results,
    'zero_result_rate',  CASE WHEN v_total_searches > 0
                              THEN ROUND(v_zero_results::numeric / v_total_searches::numeric, 4)
                         ELSE 0 END,
    'avg_result_count',  ROUND(v_avg_results, 2),
    'top_queries',       v_top_queries,
    'zero_result_queries', v_zero_queries,
    'window_days',       v_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_search_insights(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_search_insights(integer) TO authenticated, service_role;

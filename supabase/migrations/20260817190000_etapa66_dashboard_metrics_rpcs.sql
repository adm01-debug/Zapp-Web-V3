-- 20260817190000 — Métricas reais de dashboard: heatmap, metas por fila e previsão
-- de demanda com agregação no DB (Etapa 66 do plano 100 etapas; desenho sim3).
-- Substitui a amostra arbitrária `.limit(1000)` sem orderBy do front por contagem
-- exata no DB. SECDEF + search_path fixo + GRANT authenticated (padrão AGENTS.md).
-- Rollback: DROP FUNCTION zapp.fn_dashboard_heatmap(text, integer);
--           DROP FUNCTION zapp.rpc_queue_goal_metrics();
--           DROP FUNCTION zapp.fn_demand_forecast(integer, integer);

-- 66.3/66.4/66.6: agregação real de heatmap no DB. `total_rows` permite ao front
-- decidir o guard ("sem dados" vs "0 msgs" são estados distintos).
CREATE OR REPLACE FUNCTION zapp.fn_dashboard_heatmap(p_metric text DEFAULT 'volume', p_days integer DEFAULT 30)
RETURNS TABLE(day integer, hour integer, value numeric, sample_count bigint, total_rows bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'zapp','evo','pg_catalog' AS $$
DECLARE v_since timestamptz := date_trunc('day', now()) - (p_days || ' days')::interval;
        v_total bigint;
BEGIN
  IF p_metric = 'volume' THEN
    SELECT count(*) INTO v_total FROM evo.evolution_messages
      WHERE created_at >= v_since AND deleted_at IS NULL;
    RETURN QUERY
      SELECT EXTRACT(dow FROM m.created_at)::int, EXTRACT(hour FROM m.created_at)::int,
             count(*)::numeric, count(*)::bigint, v_total
      FROM evo.evolution_messages m
      WHERE m.created_at >= v_since AND m.deleted_at IS NULL
      GROUP BY 1,2;
  ELSIF p_metric = 'response_time' THEN
    SELECT count(*) INTO v_total FROM evo.evolution_conversations
      WHERE first_response_at >= v_since AND first_response_seconds IS NOT NULL;
    RETURN QUERY
      SELECT EXTRACT(dow FROM c.first_response_at)::int, EXTRACT(hour FROM c.first_response_at)::int,
             round(avg(c.first_response_seconds)::numeric, 0), count(*)::bigint, v_total
      FROM evo.evolution_conversations c
      WHERE c.first_response_at >= v_since AND c.first_response_seconds IS NOT NULL
      GROUP BY 1,2 HAVING count(*) >= 3;          -- célula só com amostra mínima (66.9)
  ELSIF p_metric = 'satisfaction' THEN
    SELECT count(*) INTO v_total FROM zapp.csat_surveys WHERE created_at >= v_since;
    RETURN QUERY
      SELECT EXTRACT(dow FROM s.created_at)::int, EXTRACT(hour FROM s.created_at)::int,
             round(avg(s.rating)::numeric, 2), count(*)::bigint, v_total
      FROM zapp.csat_surveys s
      WHERE s.created_at >= v_since
      GROUP BY 1,2 HAVING count(*) >= 3;
  ELSE
    RAISE EXCEPTION 'métrica inválida: %', p_metric USING ERRCODE = '22023';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION zapp.fn_dashboard_heatmap(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_dashboard_heatmap(text, integer) TO authenticated;

-- 66.6: métricas reais por fila para os checks de meta do useGoalNotifications.
-- 1 chamada agregada a cada 5 min (não 4×N queries). Guardas honestas (desenho c.2):
-- sem base de dados → NULL (nunca 0 inventado); 0 é dado legítimo.
CREATE OR REPLACE FUNCTION zapp.rpc_queue_goal_metrics()
RETURNS TABLE(queue_id uuid, waiting_contacts bigint, avg_wait_minutes numeric,
              assignment_rate numeric, messages_pending bigint, coverage text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'zapp','evo','pg_catalog' AS $$
  WITH pos AS (
    SELECT queue_id, count(*)::bigint AS waiting_contacts,
           round(avg(EXTRACT(EPOCH FROM (now() - entered_at))/60)::numeric, 1) AS avg_wait_minutes
    FROM zapp.queue_positions GROUP BY queue_id
  ), sticky AS (
    SELECT queue_id, count(*)::bigint AS assigned
    FROM zapp.sticky_assignments
    WHERE expires_at IS NULL OR expires_at > now() GROUP BY queue_id
  ), unread AS (
    SELECT ec.queue_id, sum(evc.unread_count)::bigint AS pending
    FROM evo.evolution_conversations evc
    JOIN evo.evolution_contacts ec ON ec.id = evc.contact_id
    WHERE ec.queue_id IS NOT NULL AND ec.deleted_at IS NULL
      AND evc.status NOT IN ('closed','resolved')
    GROUP BY ec.queue_id
  ), mapped AS (
    SELECT queue_id, count(*)::bigint AS contacts
    FROM evo.evolution_contacts
    WHERE queue_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY queue_id
  ), g_unread AS (                               -- fallback global honesto (desenho c.2):
    SELECT sum(unread_count)::bigint AS total    -- sem contatos mapeados + unread global
    FROM evo.evolution_conversations            -- > 0 → NULL, nunca distribuir inventando
    WHERE unread_count > 0 AND status NOT IN ('closed','resolved')
  ), ev7 AS (                                    -- taxa via fluxo (assign/unassign 7d)
    SELECT COALESCE(to_queue_id, from_queue_id) AS queue_id,
           round(100.0 * count(*) FILTER (WHERE event_type = 'assign') /
             NULLIF(count(*) FILTER (WHERE event_type IN ('assign','unassign')), 0), 1) AS rate
    FROM zapp.conversation_events
    WHERE created_at > now() - interval '7 days' AND event_type IN ('assign','unassign')
    GROUP BY 1
  )
  SELECT q.id,
         COALESCE(pos.waiting_contacts, 0),
         COALESCE(pos.avg_wait_minutes, 0),
         CASE WHEN COALESCE(sticky.assigned, 0) + COALESCE(pos.waiting_contacts, 0) = 0
              THEN ev7.rate ELSE
              round(100.0 * sticky.assigned / (sticky.assigned + pos.waiting_contacts), 1) END,
         CASE WHEN mapped.queue_id IS NULL AND g_unread.total > 0
              THEN NULL ELSE COALESCE(unread.pending, 0) END,
         CASE WHEN pos.queue_id IS NULL THEN 'sem_posicoes'
              WHEN sticky.queue_id IS NULL AND ev7.queue_id IS NULL THEN 'sem_atribuicao'
              ELSE 'ok' END
  FROM zapp.queues q
  LEFT JOIN pos      ON pos.queue_id = q.id
  LEFT JOIN sticky   ON sticky.queue_id = q.id
  LEFT JOIN unread   ON unread.queue_id = q.id
  LEFT JOIN mapped   ON mapped.queue_id = q.id
  LEFT JOIN ev7      ON ev7.queue_id = q.id
  CROSS JOIN g_unread
  WHERE q.is_active;
$$;
REVOKE ALL ON FUNCTION zapp.rpc_queue_goal_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_queue_goal_metrics() TO authenticated;

-- 66.6: previsão de demanda — média real por dow (28d) + tendência real (média das
-- 2 últimas semanas completas ÷ 2 anteriores, clamp [0,5; 1,5]). Sem Math.random():
-- tudo derivado de evo.evolution_messages. Se p_days < 14 → fator 1 (sem base).
CREATE OR REPLACE FUNCTION zapp.fn_demand_forecast(p_days integer DEFAULT 28, p_forecast_days integer DEFAULT 7)
RETURNS TABLE(d date, kind text, dow integer, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'zapp','evo','pg_catalog' AS $$
  WITH daily AS (
    SELECT created_at::date AS d, count(*)::numeric AS n
    FROM evo.evolution_messages
    WHERE created_at >= date_trunc('day', now()) - (p_days || ' days')::interval
      AND deleted_at IS NULL
    GROUP BY 1
  ), dow_stats AS (
    SELECT EXTRACT(dow FROM d)::int AS dow, round(avg(n), 2) AS avg_n
    FROM daily GROUP BY 1
  ), trend AS (
    SELECT CASE WHEN count(*) FILTER (WHERE d >= date_trunc('week', now()) - interval '28 days'
                                       AND d < date_trunc('week', now()) - interval '14 days') > 0
                THEN LEAST(1.5, GREATEST(0.5,
                     round(avg(n) FILTER (WHERE d >= date_trunc('week', now()) - interval '14 days'
                                           AND d < date_trunc('week', now())), 2) /
                     NULLIF(avg(n) FILTER (WHERE d >= date_trunc('week', now()) - interval '28 days'
                                           AND d < date_trunc('week', now()) - interval '14 days'), 0)))
           ELSE 1 END AS f
    FROM daily
  )
  SELECT d, 'actual'::text, EXTRACT(dow FROM d)::int, n FROM daily
    WHERE d >= date_trunc('day', now()) - interval '6 days'
  UNION ALL
  SELECT (date_trunc('day', now()) + (g || ' days')::interval)::date, 'forecast'::text,
         EXTRACT(dow FROM date_trunc('day', now()) + (g || ' days')::interval)::int,
         round(ds.avg_n * tr.f, 0)
  FROM generate_series(0, p_forecast_days - 1) g
  CROSS JOIN dow_stats ds
  CROSS JOIN trend tr;
$$;
REVOKE ALL ON FUNCTION zapp.fn_demand_forecast(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_demand_forecast(integer, integer) TO authenticated;

-- Canário: as 3 RPCs executam como authenticated (sintaxe + grants + objetos
-- referenciados) e estão registradas em zapp.
DO $$
DECLARE v_n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM * FROM zapp.rpc_queue_goal_metrics();
  PERFORM * FROM zapp.fn_demand_forecast(7, 1);
  PERFORM * FROM zapp.fn_dashboard_heatmap('volume', 1);
  RESET ROLE;
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname IN ('fn_dashboard_heatmap','rpc_queue_goal_metrics','fn_demand_forecast');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'canário etapa66: esperadas 3 RPCs em zapp, encontradas %', v_n;
  END IF;
END $$;

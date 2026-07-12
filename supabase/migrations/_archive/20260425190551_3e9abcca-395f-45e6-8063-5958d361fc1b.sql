-- Filas: priorização SLA + peso de roteamento
ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS sla_priority text NOT NULL DEFAULT 'medium'
    CHECK (sla_priority IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS routing_weight integer NOT NULL DEFAULT 1
    CHECK (routing_weight >= 0 AND routing_weight <= 100),
  ADD COLUMN IF NOT EXISTS auto_rebalance_enabled boolean NOT NULL DEFAULT true;

-- Painel SLA por fila com filtros (skill / canal / status SLA)
CREATE OR REPLACE FUNCTION public.rpc_queue_sla_panel(
  p_skill_id uuid DEFAULT NULL,
  p_channel_type text DEFAULT NULL,
  p_sla_status text DEFAULT NULL  -- 'on_track' | 'at_risk' | 'breached'
)
RETURNS TABLE (
  queue_id uuid,
  queue_name text,
  color text,
  sla_priority text,
  routing_weight integer,
  auto_rebalance_enabled boolean,
  max_wait_time_minutes integer,
  active_agents bigint,
  waiting_count bigint,
  in_progress_count bigint,
  breached_count bigint,
  at_risk_count bigint,
  oldest_wait_minutes numeric,
  last_routed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  WITH q AS (
    SELECT q.* FROM public.queues q
    WHERE q.is_active = true
      AND (
        p_skill_id IS NULL OR EXISTS (
          SELECT 1 FROM public.queue_skill_requirements qsr
          WHERE qsr.queue_id = q.id AND qsr.skill_id = p_skill_id
        )
      )
      AND (
        p_channel_type IS NULL OR EXISTS (
          SELECT 1
          FROM public.whatsapp_connection_queues wcq
          JOIN public.channel_connections cc ON cc.whatsapp_connection_id = wcq.whatsapp_connection_id
          WHERE wcq.queue_id = q.id AND cc.channel_type = p_channel_type
        )
      )
  ),
  agents AS (
    SELECT qm.queue_id, COUNT(*) FILTER (WHERE qm.is_active AND p.is_active) AS active_agents
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    GROUP BY qm.queue_id
  ),
  contacts_agg AS (
    SELECT
      c.queue_id,
      COUNT(*) FILTER (WHERE c.assigned_to IS NULL) AS waiting_count,
      COUNT(*) FILTER (WHERE c.assigned_to IS NOT NULL) AS in_progress_count,
      MAX(EXTRACT(EPOCH FROM (now() - c.created_at))/60)
        FILTER (WHERE c.assigned_to IS NULL) AS oldest_wait_minutes
    FROM public.contacts c
    WHERE c.queue_id IS NOT NULL
    GROUP BY c.queue_id
  ),
  sla_agg AS (
    SELECT
      c.queue_id,
      COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (now() - c.created_at))/60 > q.max_wait_time_minutes
      ) AS breached_count,
      COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (now() - c.created_at))/60
              BETWEEN q.max_wait_time_minutes * 0.75 AND q.max_wait_time_minutes
      ) AS at_risk_count
    FROM public.contacts c
    JOIN public.queues q ON q.id = c.queue_id
    WHERE c.assigned_to IS NULL
    GROUP BY c.queue_id
  ),
  routing AS (
    SELECT sa.queue_id, MAX(sa.last_assigned_at) AS last_routed_at
    FROM public.sticky_assignments sa
    GROUP BY sa.queue_id
  )
  SELECT
    q.id,
    q.name,
    q.color,
    q.sla_priority,
    q.routing_weight,
    q.auto_rebalance_enabled,
    q.max_wait_time_minutes,
    COALESCE(a.active_agents, 0),
    COALESCE(ca.waiting_count, 0),
    COALESCE(ca.in_progress_count, 0),
    COALESCE(s.breached_count, 0),
    COALESCE(s.at_risk_count, 0),
    COALESCE(ca.oldest_wait_minutes, 0)::numeric,
    r.last_routed_at
  FROM q
  LEFT JOIN agents a ON a.queue_id = q.id
  LEFT JOIN contacts_agg ca ON ca.queue_id = q.id
  LEFT JOIN sla_agg s ON s.queue_id = q.id
  LEFT JOIN routing r ON r.queue_id = q.id
  WHERE
    p_sla_status IS NULL
    OR (p_sla_status = 'on_track'  AND COALESCE(s.breached_count,0) = 0 AND COALESCE(s.at_risk_count,0) = 0)
    OR (p_sla_status = 'at_risk'   AND COALESCE(s.at_risk_count,0) > 0)
    OR (p_sla_status = 'breached'  AND COALESCE(s.breached_count,0) > 0)
  ORDER BY
    CASE q.sla_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    q.routing_weight DESC,
    COALESCE(s.breached_count,0) DESC;
END;
$$;

-- Lista contatos elegíveis para rebalance (sem agente OU SLA estourado), priorizados
CREATE OR REPLACE FUNCTION public.rpc_queue_rebalance_candidates(p_limit integer DEFAULT 50)
RETURNS TABLE (
  contact_id uuid,
  queue_id uuid,
  reason text,
  waiting_minutes numeric,
  sla_priority text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.queue_id,
    CASE
      WHEN c.assigned_to IS NULL THEN 'unassigned'
      ELSE 'sla_breached'
    END AS reason,
    EXTRACT(EPOCH FROM (now() - c.created_at))/60::numeric AS waiting_minutes,
    q.sla_priority
  FROM public.contacts c
  JOIN public.queues q ON q.id = c.queue_id
  WHERE q.is_active = true
    AND q.auto_rebalance_enabled = true
    AND (
      c.assigned_to IS NULL
      OR EXTRACT(EPOCH FROM (now() - c.created_at))/60 > q.max_wait_time_minutes
    )
  ORDER BY
    CASE q.sla_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    q.routing_weight DESC,
    c.created_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END;
$$;
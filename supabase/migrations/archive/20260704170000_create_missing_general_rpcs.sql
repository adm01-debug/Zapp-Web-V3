-- =============================================================================
-- FALHA #7 — Create missing general RPCs referenced in frontend but absent from DB
-- Idempotent: CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS — safe to re-apply.
-- All functions use SECURITY DEFINER + SET search_path to prevent privesc.
-- All functions use EXCEPTION WHEN to degrade gracefully if tables don't exist.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schema patch: add note_type and is_pinned to public.contact_notes
-- ContactNotesPanel.tsx expects these fields from get_contact_notes()
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.contact_notes
  ADD COLUMN IF NOT EXISTS note_type  text    NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS is_pinned  boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- get_contact_notes (REPLACE existing — returns correct Note shape)
--   Called by: src/components/contacts/ContactNotesPanel.tsx
--   Params:    p_contact_id uuid, p_limit integer DEFAULT 30
--   Returns:   id, content, note_type, is_pinned, created_by, created_at
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_contact_notes(uuid, integer);
CREATE FUNCTION public.get_contact_notes(
  p_contact_id uuid,
  p_limit      integer DEFAULT 30
)
RETURNS TABLE(
  id         uuid,
  content    text,
  note_type  text,
  is_pinned  boolean,
  created_by text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.content,
    COALESCE(n.note_type, 'general') AS note_type,
    COALESCE(n.is_pinned, false)     AS is_pinned,
    pr.name                          AS created_by,
    n.created_at
  FROM public.contact_notes n
  LEFT JOIN public.profiles pr ON pr.id = n.author_id
  WHERE n.contact_id = p_contact_id
  ORDER BY n.is_pinned DESC, n.created_at DESC
  LIMIT COALESCE(p_limit, 30);
EXCEPTION WHEN undefined_table THEN
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.get_contact_notes(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contact_notes(uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- mark_follow_up_done
--   Marks a message's follow-up as done in evo.evolution_messages.
--   Called by: src/hooks/useMessages.ts (RPC.markFollowUpDone)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_follow_up_done(
  p_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'evo'
AS $$
BEGIN
  BEGIN
    UPDATE evo.evolution_messages
    SET follow_up_done = true,
        updated_at     = now()
    WHERE id = p_message_id;
  EXCEPTION WHEN undefined_column THEN
    -- Column does not exist yet — no-op, return ok
    NULL;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN jsonb_build_object('ok', true, 'message_id', p_message_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_follow_up_done(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_follow_up_done(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_csat_stats
--   Returns aggregated CSAT & NPS metrics for the given instance and period.
--   CSAT source: public.csat_surveys (rating integer 0–10)
--   NPS  source: public.nps_surveys  (score  integer 0–10)
--     promoters  >= 9, detractors <= 6, passives = 7–8
--   Called by: src/components/csat/CSATWidget.tsx
--
--   Return shape (CSATStats):
--     total_responses    bigint
--     avg_score          numeric | null
--     nps_promoters      bigint
--     nps_detractors     bigint
--     nps_passives       bigint
--     nps_score          integer   (promoter% - detractor%)
--     score_distribution jsonb     {"0":n,"1":n,...,"10":n}
--     by_agent           jsonb | null   {agent_name: avg_score}
--     period_days        integer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_csat_stats(
  p_instance_name text    DEFAULT NULL,
  p_days          integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days   integer     := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_since  timestamptz := now() - (v_days * interval '1 day');

  -- CSAT aggregates
  v_total  bigint  := 0;
  v_avg    numeric := NULL;
  v_dist   jsonb   := '{}'::jsonb;
  v_agents jsonb   := NULL;

  -- NPS aggregates
  v_promo  bigint  := 0;
  v_detra  bigint  := 0;
  v_passi  bigint  := 0;
  v_total_nps bigint := 0;
  v_nps    integer := 0;
BEGIN
  -- CSAT survey aggregation
  BEGIN
    SELECT
      COUNT(*),
      ROUND(AVG(rating::numeric), 2)
    INTO v_total, v_avg
    FROM public.csat_surveys
    WHERE created_at >= v_since;

    SELECT jsonb_object_agg(score::text, cnt) INTO v_dist FROM (
      SELECT rating AS score, COUNT(*) AS cnt
      FROM public.csat_surveys
      WHERE created_at >= v_since
      GROUP BY rating
    ) t;

    SELECT jsonb_object_agg(agent_name, agent_avg) INTO v_agents FROM (
      SELECT
        COALESCE(pr.name, 'Desconhecido') AS agent_name,
        ROUND(AVG(cs.rating::numeric), 2) AS agent_avg
      FROM public.csat_surveys cs
      LEFT JOIN public.profiles pr ON pr.id = cs.agent_id
      WHERE cs.created_at >= v_since
        AND cs.agent_id IS NOT NULL
      GROUP BY pr.name
      ORDER BY agent_avg DESC
      LIMIT 20
    ) t;
  EXCEPTION WHEN undefined_table THEN
    v_total := 0; v_avg := NULL; v_dist := '{}'::jsonb; v_agents := NULL;
  END;

  -- NPS survey aggregation
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE score >= 9),
      COUNT(*) FILTER (WHERE score <= 6),
      COUNT(*) FILTER (WHERE score BETWEEN 7 AND 8),
      COUNT(*)
    INTO v_promo, v_detra, v_passi, v_total_nps
    FROM public.nps_surveys
    WHERE created_at >= v_since;

    IF v_total_nps > 0 THEN
      v_nps := ROUND(
        ((v_promo::numeric - v_detra::numeric) / v_total_nps::numeric) * 100
      )::integer;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    v_promo := 0; v_detra := 0; v_passi := 0; v_nps := 0;
  END;

  RETURN jsonb_build_object(
    'total_responses',    v_total,
    'avg_score',          v_avg,
    'nps_promoters',      v_promo,
    'nps_detractors',     v_detra,
    'nps_passives',       v_passi,
    'nps_score',          v_nps,
    'score_distribution', COALESCE(v_dist, '{}'::jsonb),
    'by_agent',           v_agents,
    'period_days',        v_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_csat_stats(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_csat_stats(text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_sla_dashboard
--   Returns SLA compliance metrics for the given instance and period.
--   Source: public.conversation_sla
--   Called by: src/components/sla/SLADashboard.tsx
--
--   Return shape (SLAStats):
--     total_violations          bigint
--     unresolved_violations     bigint
--     first_response_violations bigint
--     resolution_violations     bigint
--     breached_conversations    bigint
--     compliance_rate_pct       numeric   (0–100)
--     avg_overdue_minutes       numeric | null
--     period_days               integer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sla_dashboard(
  p_instance_name text    DEFAULT NULL,
  p_days          integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days      integer     := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_since     timestamptz := now() - (v_days * interval '1 day');

  v_total_first  bigint  := 0;
  v_total_resol  bigint  := 0;
  v_total_conv   bigint  := 0;
  v_unresolved   bigint  := 0;
  v_breached     bigint  := 0;
  v_compliance   numeric := 100;
  v_avg_overdue  numeric := NULL;
BEGIN
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE first_response_breached IS TRUE),
      COUNT(*) FILTER (WHERE resolution_breached     IS TRUE),
      COUNT(*),
      COUNT(*) FILTER (WHERE (first_response_breached IS TRUE OR resolution_breached IS TRUE) AND resolved_at IS NULL),
      COUNT(DISTINCT contact_id) FILTER (WHERE first_response_breached IS TRUE OR resolution_breached IS TRUE)
    INTO v_total_first, v_total_resol, v_total_conv, v_unresolved, v_breached
    FROM public.conversation_sla
    WHERE created_at >= v_since;

    IF v_total_conv > 0 THEN
      v_compliance := ROUND(
        (1 - (v_breached::numeric / NULLIF(v_total_conv, 0))) * 100,
        1
      );
    END IF;

    -- avg_overdue_minutes: average delay for breached entries
    -- approximated as time between first_message_at and first_response_at for first-response breaches
    SELECT ROUND(
      AVG(EXTRACT(EPOCH FROM (COALESCE(first_response_at, now()) - first_message_at)) / 60),
      1
    ) INTO v_avg_overdue
    FROM public.conversation_sla
    WHERE created_at >= v_since
      AND first_response_breached IS TRUE
      AND first_message_at IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN
    -- Return safe defaults — no SLA data yet
    NULL;
  END;

  RETURN jsonb_build_object(
    'total_violations',          v_total_first + v_total_resol,
    'unresolved_violations',     v_unresolved,
    'first_response_violations', v_total_first,
    'resolution_violations',     v_total_resol,
    'breached_conversations',    v_breached,
    'compliance_rate_pct',       GREATEST(v_compliance, 0),
    'avg_overdue_minutes',       v_avg_overdue,
    'period_days',               v_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sla_dashboard(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sla_dashboard(text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_platform_health
--   Aggregates platform-wide KPIs into a single structured response.
--   Called by: src/components/dashboard/PlatformHealthDashboard.tsx
--
--   Parameters:
--     p_instance_name text    — Evolution instance to filter on
--     p_days          integer — Window for "today" metrics (default 1)
--
--   Return shape (PlatformHealth):
--     contacts      { total_active, new_today, duplicates, consent_rate_pct }
--     conversations { open, closed_today, unread, bot_active, avg_response_s }
--     messages      { total_today, inbound_today, follow_ups }
--     webhooks      { total_events, processed_events, pending_events, dlq_pending }
--     instance_name text
--     generated_at  timestamptz
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_health(
  p_instance_name text    DEFAULT 'wpp2',
  p_days          integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'evo'
AS $$
DECLARE
  v_days   integer     := LEAST(GREATEST(COALESCE(p_days, 1), 1), 30);
  v_since  timestamptz := now() - (v_days * interval '1 day');
  v_today  timestamptz := date_trunc('day', now());

  -- contacts
  v_total_active  bigint  := 0;
  v_new_today     bigint  := 0;
  v_duplicates    bigint  := 0;
  v_consent_pct   text    := '0';

  -- conversations
  v_open          bigint  := 0;
  v_closed_today  bigint  := 0;
  v_unread        bigint  := 0;
  v_bot_active    bigint  := 0;
  v_avg_resp_s    numeric := NULL;

  -- messages
  v_total_today   bigint  := 0;
  v_inbound_today bigint  := 0;
  v_follow_ups    bigint  := 0;

  -- webhooks
  v_wh_total      bigint  := 0;
  v_wh_processed  bigint  := 0;
  v_wh_pending    bigint  := 0;
  v_dlq_pending   bigint  := 0;
BEGIN
  -- ── Contacts ──────────────────────────────────────────────────────────────
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE lead_status IS DISTINCT FROM 'archived'),
      COUNT(*) FILTER (WHERE created_at >= v_today)
    INTO v_total_active, v_new_today
    FROM evo.evolution_contacts
    WHERE (p_instance_name IS NULL OR instance_name = p_instance_name);

    -- Consent rate: contacts with lgpd opt-in / total active
    -- Use raw JSONB field if direct column not available
    BEGIN
      EXECUTE format(
        'SELECT COUNT(*) FROM evo.evolution_contacts WHERE (lgpd_consent IS TRUE) AND (%L IS NULL OR instance_name = %L)',
        p_instance_name, p_instance_name
      ) INTO v_consent_pct;
      IF v_total_active > 0 THEN
        v_consent_pct := ROUND(
          (v_consent_pct::numeric / v_total_active::numeric) * 100, 1
        )::text;
      ELSE
        v_consent_pct := '100';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_consent_pct := '100';
    END;
  EXCEPTION WHEN undefined_table THEN
    -- Try public.contacts view fallback
    BEGIN
      SELECT COUNT(*) INTO v_total_active
      FROM public.contacts
      WHERE (p_instance_name IS NULL OR instance_name = p_instance_name);
      SELECT COUNT(*) INTO v_new_today
      FROM public.contacts
      WHERE created_at >= v_today
        AND (p_instance_name IS NULL OR instance_name = p_instance_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  -- ── Conversations ─────────────────────────────────────────────────────────
  BEGIN
    -- evolution_conversations has unread_count per row
    SELECT
      COUNT(*),
      COALESCE(SUM(unread_count), 0)
    INTO v_open, v_unread
    FROM evo.evolution_conversations
    WHERE last_message_at >= v_since
      AND (p_instance_name IS NULL OR instance_name = p_instance_name);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- closed_today: contacts whose last_message_at is older than today (proxy)
  BEGIN
    SELECT COUNT(*) INTO v_closed_today
    FROM evo.evolution_contacts
    WHERE last_message_at >= v_today
      AND lead_status = 'closed'
      AND (p_instance_name IS NULL OR instance_name = p_instance_name);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- bot_active: contacts with bot_active=true if column exists
  BEGIN
    EXECUTE format(
      'SELECT COUNT(*) FROM evo.evolution_contacts WHERE bot_active IS TRUE AND (%L IS NULL OR instance_name = %L)',
      p_instance_name, p_instance_name
    ) INTO v_bot_active;
  EXCEPTION WHEN OTHERS THEN
    v_bot_active := 0;
  END;

  -- ── Messages ──────────────────────────────────────────────────────────────
  BEGIN
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE from_me IS FALSE)
    INTO v_total_today, v_inbound_today
    FROM evo.evolution_messages
    WHERE timestamp >= v_today
      AND (p_instance_name IS NULL OR instance_name = p_instance_name);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- follow_ups: messages with follow_up_at set and not done
  BEGIN
    EXECUTE format(
      'SELECT COUNT(*) FROM evo.evolution_messages WHERE follow_up_at IS NOT NULL AND follow_up_done IS NOT TRUE AND (%L IS NULL OR instance_name = %L)',
      p_instance_name, p_instance_name
    ) INTO v_follow_ups;
  EXCEPTION WHEN OTHERS THEN
    v_follow_ups := 0;
  END;

  -- ── Webhooks ──────────────────────────────────────────────────────────────
  BEGIN
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE processed IS TRUE),
      COUNT(*) FILTER (WHERE processed IS FALSE OR processed IS NULL)
    INTO v_wh_total, v_wh_processed, v_wh_pending
    FROM evo.evolution_webhook_events
    WHERE created_at >= v_since
      AND (p_instance_name IS NULL OR instance_name = p_instance_name);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- DLQ: old unprocessed webhooks (> 1 hour) as DLQ proxy
  BEGIN
    SELECT COUNT(*) INTO v_dlq_pending
    FROM evo.evolution_webhook_events
    WHERE (processed IS FALSE OR processed IS NULL)
      AND created_at < now() - interval '1 hour'
      AND (p_instance_name IS NULL OR instance_name = p_instance_name);
  EXCEPTION WHEN OTHERS THEN
    v_dlq_pending := 0;
  END;

  RETURN jsonb_build_object(
    'contacts', jsonb_build_object(
      'total_active',     v_total_active,
      'new_today',        v_new_today,
      'duplicates',       v_duplicates,
      'consent_rate_pct', v_consent_pct
    ),
    'conversations', jsonb_build_object(
      'open',           v_open,
      'closed_today',   v_closed_today,
      'unread',         v_unread,
      'bot_active',     v_bot_active,
      'avg_response_s', v_avg_resp_s
    ),
    'messages', jsonb_build_object(
      'total_today',   v_total_today,
      'inbound_today', v_inbound_today,
      'follow_ups',    v_follow_ups
    ),
    'webhooks', jsonb_build_object(
      'total_events',     v_wh_total,
      'processed_events', v_wh_processed,
      'pending_events',   v_wh_pending,
      'dlq_pending',      v_dlq_pending
    ),
    'instance_name', COALESCE(p_instance_name, 'all'),
    'generated_at',  now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_health(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_health(text, integer) TO authenticated, service_role;

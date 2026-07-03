-- QA Round 4 (2026-07-03) - RPCs fantasma: 101 RPCs do codigo cruzados com pg_proc => 10 inexistentes.
-- 5 criados aqui (semantica derivada dos call sites + contratos TS); ja aplicados em prod e validados
-- (13/13 via PostgREST como authenticated + testes de fila/token em rollback).
-- NAO criados (exigem politica de negocio - inventar seria pior que o erro):
--   fn_auto_escalate_sla, smart_assign_conversation, rpc_upsert_whatsapp_provider (armazenamento seguro de api_key)
-- NAO criados (degradacao graciosa por design em analyze-external-db):
--   get_all_table_names, get_tables_info

-- 1) store_reset_token - fluxo de reset de senha (edge approve-password-reset)
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.password_reset_requests(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_reset_tokens FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.store_reset_token(p_request_id uuid, p_token text, p_expires_at timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.password_reset_tokens (request_id, token_hash, expires_at)
  VALUES (p_request_id, p_token, p_expires_at)
$$;
REVOKE ALL ON FUNCTION public.store_reset_token(uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_reset_token(uuid,text,timestamptz) TO service_role;

-- 2) claim_next_voice_task - claim atomico FIFO (edge voice-changer); FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_next_voice_task(p_user_id uuid DEFAULT NULL)
RETURNS SETOF zapp.voice_conversion_queue LANGUAGE sql SECURITY DEFINER SET search_path = zapp, public, pg_temp AS $$
  UPDATE zapp.voice_conversion_queue SET status='processing', started_at=now(), updated_at=now()
  WHERE id = (SELECT id FROM zapp.voice_conversion_queue WHERE status='pending'
              ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING *
$$;
REVOKE ALL ON FUNCTION public.claim_next_voice_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_next_voice_task(uuid) TO authenticated, service_role;

-- 3) get_csat_stats - contrato CSATStats do CSATWidget (fonte: zapp.csat_responses, rating 1-5)
CREATE OR REPLACE FUNCTION public.get_csat_stats(p_instance_name text DEFAULT NULL, p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = zapp, public, pg_temp AS $$
  WITH base AS (
    SELECT r.rating, r.agent_id FROM zapp.csat_responses r
    WHERE r.created_at >= now() - make_interval(days => GREATEST(p_days,1))
      AND (p_instance_name IS NULL OR r.instance_name = p_instance_name))
  SELECT jsonb_build_object(
    'total_responses', count(*),
    'avg_score', round(avg(rating)::numeric, 2),
    'nps_promoters', count(*) FILTER (WHERE rating = 5),
    'nps_passives',  count(*) FILTER (WHERE rating = 4),
    'nps_detractors', count(*) FILTER (WHERE rating <= 3),
    'nps_score', CASE WHEN count(*)=0 THEN 0 ELSE round(100.0*(count(*) FILTER (WHERE rating=5) - count(*) FILTER (WHERE rating<=3))/count(*)) END,
    'score_distribution', COALESCE((SELECT jsonb_object_agg(rating::text, n) FROM (SELECT rating, count(*) n FROM base GROUP BY rating) d), '{}'::jsonb),
    'by_agent', (SELECT jsonb_object_agg(agent_id::text, avg_r) FROM (SELECT agent_id, round(avg(rating)::numeric,2) avg_r FROM base WHERE agent_id IS NOT NULL GROUP BY agent_id) a),
    'period_days', p_days)
  FROM base
$$;
REVOKE ALL ON FUNCTION public.get_csat_stats(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_csat_stats(text,integer) TO authenticated, service_role;

-- 4) get_sla_dashboard - contrato SLAStats do SLADashboard (fonte: zapp.sla_delivery_violations)
CREATE OR REPLACE FUNCTION public.get_sla_dashboard(p_instance_name text DEFAULT NULL, p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = zapp, evo, public, pg_temp AS $$
  WITH v AS (SELECT * FROM zapp.sla_delivery_violations WHERE detected_at >= now() - make_interval(days => GREATEST(p_days,1))),
       conv AS (SELECT count(*) AS total FROM evo.evolution_conversations WHERE created_at >= now() - make_interval(days => GREATEST(p_days,1)))
  SELECT jsonb_build_object(
    'total_violations', (SELECT count(*) FROM v),
    'unresolved_violations', (SELECT count(*) FROM v WHERE NOT is_resolved),
    'first_response_violations', (SELECT count(*) FROM v WHERE threshold_type ILIKE '%first%' OR threshold_type ILIKE '%response%'),
    'resolution_violations', (SELECT count(*) FROM v WHERE threshold_type ILIKE '%resol%'),
    'breached_conversations', (SELECT count(DISTINCT contact_id) FROM v),
    'compliance_rate_pct', (SELECT CASE WHEN c.total=0 THEN 100 ELSE round(100.0*GREATEST(c.total - (SELECT count(DISTINCT contact_id) FROM v),0)/c.total, 1) END FROM conv c),
    'avg_overdue_minutes', (SELECT round(avg(EXTRACT(EPOCH FROM (COALESCE(resolved_at, now()) - detected_at))/60.0)::numeric,1) FROM v),
    'period_days', p_days)
$$;
REVOKE ALL ON FUNCTION public.get_sla_dashboard(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sla_dashboard(text,integer) TO authenticated, service_role;

-- 5) get_platform_health - contrato PlatformHealth do dashboard (fontes: evo.* + zapp.failed_messages)
--    consent_rate_pct='n/a': consent_records e por user_id, nao por contato (dado nao deriavel - honestidade > numero inventado)
CREATE OR REPLACE FUNCTION public.get_platform_health(p_instance_name text DEFAULT NULL, p_days integer DEFAULT 1)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = zapp, evo, public, pg_temp AS $$
  SELECT jsonb_build_object(
    'contacts', jsonb_build_object(
      'total_active', (SELECT count(*) FROM evo.evolution_contacts WHERE deleted_at IS NULL),
      'new_today', (SELECT count(*) FROM evo.evolution_contacts WHERE created_at >= date_trunc('day', now()) AND deleted_at IS NULL),
      'duplicates', (SELECT COALESCE(sum(n-1),0) FROM (SELECT count(*) n FROM evo.evolution_contacts WHERE deleted_at IS NULL AND phone_number IS NOT NULL GROUP BY phone_number HAVING count(*)>1) d),
      'consent_rate_pct', 'n/a'),
    'conversations', jsonb_build_object(
      'open', (SELECT count(*) FROM evo.evolution_conversations WHERE status NOT IN ('closed','resolved') OR status IS NULL),
      'closed_today', (SELECT count(*) FROM evo.evolution_conversations WHERE status IN ('closed','resolved') AND updated_at >= date_trunc('day', now())),
      'unread', (SELECT COALESCE(sum(unread_count),0) FROM evo.evolution_conversations),
      'bot_active', (SELECT count(*) FROM evo.evolution_conversations WHERE COALESCE(is_bot_active,false)),
      'avg_response_s', NULL),
    'messages', jsonb_build_object(
      'total_today', (SELECT count(*) FROM evo.evolution_messages WHERE created_at >= date_trunc('day', now())),
      'inbound_today', (SELECT count(*) FROM evo.evolution_messages WHERE created_at >= date_trunc('day', now()) AND COALESCE(from_me,false)=false),
      'outbound_today', (SELECT count(*) FROM evo.evolution_messages WHERE created_at >= date_trunc('day', now()) AND COALESCE(from_me,false)=true),
      'failed_today', (SELECT count(*) FROM zapp.failed_messages WHERE created_at >= date_trunc('day', now()))),
    'webhooks', jsonb_build_object(
      'total_events', (SELECT count(*) FROM evo.evolution_webhook_events WHERE created_at >= now() - make_interval(days => GREATEST(p_days,1))),
      'processed_events', (SELECT count(*) FROM evo.evolution_webhook_events WHERE created_at >= now() - make_interval(days => GREATEST(p_days,1)) AND processed_at IS NOT NULL),
      'pending_events', (SELECT count(*) FROM evo.evolution_webhook_events WHERE created_at >= now() - make_interval(days => GREATEST(p_days,1)) AND processed_at IS NULL),
      'dlq_pending', (SELECT count(*) FROM zapp.failed_messages WHERE status IN ('pending','retrying'))),
    'instance_name', COALESCE(p_instance_name,'all'),
    'generated_at', now()::text)
$$;
REVOKE ALL ON FUNCTION public.get_platform_health(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_health(text,integer) TO authenticated, service_role;

-- AUDITORIA DE INDICES (round 4, sem acao - registrado):
-- * 0 FKs sem indice; 0 tabelas com seq-scan pesado.
-- * 70 'duplicados' em evo.*: ou sustentam UNIQUE, ou sao indices-pai de particao, ou
--   sao o indice MAIS usado da tabela (idx_evo_wpp2_created_at_btree: 38.563 scans vs 1.801
--   do covering 14x maior - dropar seria anti-otimizacao). Nenhum drop justificado.

NOTIFY pgrst, 'reload schema';

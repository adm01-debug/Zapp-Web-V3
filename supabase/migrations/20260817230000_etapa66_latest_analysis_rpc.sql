-- ============================================================================
-- Migration: 20260817230000_etapa66_latest_analysis_rpc.sql
-- GAP-6 / Etapa 66 — RPC real de última análise de contato.
--
-- Substitui o stub `zapp.get_latest_analysis` para o consumidor de UI:
--   useLatestAnalysis(contactId) → supabase.rpc('rpc_latest_contact_analysis')
--
-- FONTES REAIS (dados existentes, nenhuma tabela nova, nenhum DO block):
--   zapp.conversation_analyses    → análise mais recente do contato
--   zapp.ai_conversation_tags     → tags IA do contato
--   zapp.conversation_events      → últimos eventos da conversa
--   zapp.conversation_sla         → SLA + tempo de resolução (mesma semântica
--                                   do trigger zapp.fn_calculate_resolution_time)
--
-- SEGURANÇA: SECURITY DEFINER com search_path fixo ('zapp','pg_catalog').
-- Autorização: mesmo critério das policies RLS das tabelas-fonte
-- (zapp.is_contact_visible_to_user(...) OR zapp.is_admin_or_supervisor(...)).
-- Sem o check explícito, o SECURITY DEFINER vazaria dados de contatos de
-- outros agentes — por isso a falha honesta com ERRCODE 42501.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS zapp.rpc_latest_contact_analysis(uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.rpc_latest_contact_analysis(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_analysis jsonb;
  v_tags     jsonb;
  v_events   jsonb;
  v_sla      jsonb;
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'p_contact_id é obrigatório' USING ERRCODE = '22023';
  END IF;

  -- Mesmo critério das policies RLS das tabelas-fonte (conv_analyses_select,
  -- conv_events_select, etc.) — SECURITY DEFINER exige o check explícito.
  IF NOT (
    zapp.is_contact_visible_to_user(p_contact_id, auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  ) THEN
    RAISE EXCEPTION 'permissão negada: contato não visível para o usuário (42501)'
      USING ERRCODE = '42501';
  END IF;

  -- Última análise do contato (preferindo análises concluídas).
  SELECT jsonb_build_object(
           'id',            a.id,
           'contact_id',    a.contact_id,
           'sentiment',     a.sentiment,
           'urgency',       a.urgency,
           'summary',       a.summary,
           'department',    a.department,
           'confidence',    COALESCE(a.sentiment_score, a.customer_satisfaction),
           'status',        a.status,
           'created_at',    a.created_at
         )
    INTO v_analysis
    FROM zapp.conversation_analyses a
   WHERE a.contact_id = p_contact_id
   ORDER BY (a.status = 'completed') DESC, a.created_at DESC NULLS LAST
   LIMIT 1;

  -- Tags IA do contato (fonte: zapp.ai_conversation_tags).
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('tag', t.tag_name, 'confidence', t.confidence)
             ORDER BY t.created_at DESC, t.tag_name
           ),
           '[]'::jsonb
         )
    INTO v_tags
    FROM zapp.ai_conversation_tags t
   WHERE t.contact_id = p_contact_id;

  -- Últimos 5 eventos da conversa do contato.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'event_type',   e.event_type,
               'created_at',   e.created_at,
               'performed_by', e.performed_by,
               'metadata',     e.metadata
             )
             ORDER BY e.created_at DESC
           ),
           '[]'::jsonb
         )
    INTO v_events
    FROM (
      SELECT event_type, created_at, performed_by, metadata
        FROM zapp.conversation_events
       WHERE contact_id = p_contact_id
       ORDER BY created_at DESC
       LIMIT 5
    ) e;

  -- SLA mais recente + tempo de resolução em segundos (semântica do trigger
  -- zapp.fn_calculate_resolution_time: resolved_at - first_message_at).
  SELECT jsonb_build_object(
           'first_message_at',      s.first_message_at,
           'first_response_at',     s.first_response_at,
           'first_response_breached', s.first_response_breached,
           'resolved_at',           s.resolved_at,
           'resolution_breached',   s.resolution_breached,
           'resolution_seconds',    CASE
             WHEN s.resolved_at IS NOT NULL AND s.first_message_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (s.resolved_at - s.first_message_at))::integer
             ELSE NULL
           END
         )
    INTO v_sla
    FROM zapp.conversation_sla s
   WHERE s.contact_id = p_contact_id
   ORDER BY s.created_at DESC NULLS LAST
   LIMIT 1;

  -- Vazio honesto: nenhum dado real do contato → NULL (sem erro).
  IF v_analysis IS NULL AND v_tags = '[]'::jsonb
     AND v_events = '[]'::jsonb AND v_sla IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'analysis',    v_analysis,
    'tags',        v_tags,
    'events',      v_events,
    'sla',         v_sla,
    'generated_at', now()
  );
END $function$;

REVOKE ALL ON FUNCTION zapp.rpc_latest_contact_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_latest_contact_analysis(uuid) TO authenticated, service_role;

-- =============================================================================
-- Hardening das RPCs de email (Fase 2 - validacao adversarial)
-- Registra em migracao versionada as definicoes endurecidas aplicadas ao
-- self-hosted durante 242 asserts / 15 suites de simulacao.
-- Idempotente: CREATE OR REPLACE, seguro para re-aplicar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rpc_email_search_threads
--   * p_status explicito tem precedencia sobre o guard implicito de label INBOX
--     (bug: p_status='archived' sem p_label_id retornava 0)
--   * p_label_id vazio/so-espacos (NULLIF+btrim) = sem filtro de label
--   * CLAMP anti-dump: p_limit LEAST(GREATEST(x,0),200); p_offset GREATEST(x,0)
--     (a view public.email_threads e exposta a anon via PostgREST)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_email_search_threads(
  p_query text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_label_id text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','evo','zapp','monitoring'
AS $fn$
DECLARE
  v jsonb;
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 0), 200);   -- clamp 0..200 (teto anti-dump)
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);               -- nunca negativo
  v_label  text    := NULLIF(btrim(COALESCE(p_label_id, '')), '');      -- '' e espacos => sem filtro de label
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v FROM (
    SELECT id, id AS thread_id, gmail_thread_id::text AS email_thread_id,
           gmail_account_id AS account_id, subject, snippet, status,
           is_starred, is_unread, is_important,
           CASE WHEN is_unread THEN GREATEST(COALESCE(message_count,1),1) ELSE 0 END AS unread_count,
           last_message_at, message_count, assigned_to, sla_status, first_reply_at, created_at
    FROM email_app.email_threads
    WHERE (p_account_id IS NULL OR gmail_account_id = p_account_id)
      AND (p_status IS NULL OR status = p_status)
      -- filtro de label (status explicito tem precedencia)
      AND (
        p_status IS NOT NULL
        OR v_label IS NULL
        OR upper(v_label) = 'INBOX'
        OR (upper(v_label) = 'ARCHIVE'   AND status = 'archived')
        OR (upper(v_label) = 'STARRED'   AND is_starred IS TRUE)
        OR (upper(v_label) = 'IMPORTANT' AND is_important IS TRUE)
        OR (upper(v_label) NOT IN ('INBOX','ARCHIVE','STARRED','IMPORTANT') AND label_ids ILIKE '%' || v_label || '%')
      )
      -- INBOX oculta arquivados, mas so quando nao ha status explicito
      AND (p_status IS NOT NULL OR v_label IS NULL OR upper(v_label) <> 'INBOX' OR status IS DISTINCT FROM 'archived')
      AND (p_query IS NULL OR subject ILIKE '%' || p_query || '%' OR snippet ILIKE '%' || p_query || '%')
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT v_limit OFFSET v_offset
  ) t;
  RETURN v;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- rpc_log_email_health
--   * Sanitiza status fora do dominio da CHECK chk_email_health_status
--     ({healthy,degraded,error,unknown}) para 'unknown' (bug: 500 no UPDATE);
--     'ok' -> 'healthy' por compatibilidade.
--   * Log bruto em email_health_logs preserva o p_status original.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_log_email_health(
  p_status text,
  p_operation text DEFAULT NULL,
  p_resource text DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_is_failure boolean DEFAULT NULL,
  p_account_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','evo','zapp','monitoring'
AS $fn$
DECLARE
  v_failure_count integer := 0;
  v_is_failure boolean := COALESCE(p_is_failure, p_status IN ('error','degraded'));
  -- status para a coluna do summary respeita a CHECK; fora do dominio => 'unknown'
  v_summary_status text := CASE WHEN p_status IN ('healthy','degraded','error','unknown') THEN p_status
                                WHEN p_status = 'ok' THEN 'healthy'
                                ELSE 'unknown' END;
BEGIN
  -- log bruto preserva o p_status original (a tabela de logs nao tem CHECK)
  INSERT INTO public.email_health_logs (account_id, status, operation, resource, request_id, error_message, metadata, is_failure)
  VALUES (p_account_id, p_status, p_operation, p_resource, p_request_id, p_error_message, p_metadata, v_is_failure);

  SELECT failure_count INTO v_failure_count FROM public.email_health_summary WHERE id = 'current';
  IF v_is_failure THEN
    v_failure_count := COALESCE(v_failure_count, 0) + 1;
  ELSE
    v_failure_count := 0;
  END IF;

  UPDATE public.email_health_summary
  SET status = v_summary_status, failure_count = v_failure_count, last_checked_at = now(), updated_at = now()
  WHERE id = 'current';

  RETURN jsonb_build_object('logged', true, 'status', p_status, 'summary_status', v_summary_status, 'failure_count', v_failure_count);
END;
$fn$;

-- Recarrega o schema cache do PostgREST
NOTIFY pgrst, 'reload schema';

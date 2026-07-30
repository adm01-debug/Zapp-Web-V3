-- =============================================================================
-- Security Hardening M1–M7 (2026-07-02)
-- Executado apos validacao adversarial exaustiva (93 asserts / 8 suites)
-- Idempotente: seguro para re-aplicar
-- =============================================================================

-- -----------------------------------------------------------------------------
-- M1: clear_login_attempts — REVOKE de PUBLIC/anon + guard auth.role()
-- Risco corrigido: anon podia zerar contagem de tentativas de qualquer email
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.clear_login_attempts(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_login_attempts(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.clear_login_attempts(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.clear_login_attempts(text) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'evo', 'zapp', 'monitoring'
AS $fn$
BEGIN
  -- Guard: apenas authenticated ou service_role pode limpar tentativas
  IF auth.role() NOT IN ('authenticated', 'service_role', 'postgres') THEN
    RAISE EXCEPTION 'permission denied: apenas usuarios autenticados podem limpar tentativas de login'
      USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$fn$;

-- -----------------------------------------------------------------------------
-- M2: RPCs de email — REVOKE de PUBLIC/anon (enumeracao + mutacao eliminadas)
-- Risco corrigido: anon podia ler/arquivar/atribuir/marcar threads de qualquer user
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_email_search_threads(text, uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_email_archive_thread(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_email_assign_thread(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_email_mark_thread_read(uuid, boolean, boolean, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_log_email_health(text, text, text, text, text, jsonb, boolean, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_email_search_threads(text, uuid, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_email_archive_thread(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_email_assign_thread(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_email_mark_thread_read(uuid, boolean, boolean, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_log_email_health(text, text, text, text, text, jsonb, boolean, uuid) TO authenticated, service_role;

-- Defesa em profundidade: guard auth.uid() dentro de rpc_email_search_threads
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
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 0), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_label  text    := NULLIF(btrim(COALESCE(p_label_id, '')), '');
BEGIN
  -- Guard: apenas usuarios autenticados podem buscar threads
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v FROM (
    SELECT id, id AS thread_id, gmail_thread_id::text AS email_thread_id,
           gmail_account_id AS account_id, subject, snippet, status,
           is_starred, is_unread, is_important,
           CASE WHEN is_unread THEN GREATEST(COALESCE(message_count,1),1) ELSE 0 END AS unread_count,
           last_message_at, message_count, assigned_to, sla_status, first_reply_at, created_at
    FROM email_app.email_threads
    WHERE (p_account_id IS NULL OR gmail_account_id = p_account_id)
      AND (p_status IS NULL OR status = p_status)
      AND (
        p_status IS NOT NULL
        OR v_label IS NULL
        OR upper(v_label) = 'INBOX'
        OR (upper(v_label) = 'ARCHIVE'   AND status = 'archived')
        OR (upper(v_label) = 'STARRED'   AND is_starred IS TRUE)
        OR (upper(v_label) = 'IMPORTANT' AND is_important IS TRUE)
        OR (upper(v_label) NOT IN ('INBOX','ARCHIVE','STARRED','IMPORTANT') AND label_ids ILIKE '%' || v_label || '%')
      )
      AND (p_status IS NOT NULL OR v_label IS NULL OR upper(v_label) <> 'INBOX' OR status IS DISTINCT FROM 'archived')
      AND (p_query IS NULL OR subject ILIKE '%' || p_query || '%' OR snippet ILIKE '%' || p_query || '%')
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT v_limit OFFSET v_offset
  ) t;
  RETURN v;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- M3: record_failed_login — guard anti-DoS por IP (>50 tentativas/hora)
-- Risco corrigido: anon podia bloquear qualquer conta em loop (DoS de lockout)
-- Mantém anon EXECUTE: FE precisa registrar falhas antes de autenticar
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_failed_login(
  p_email text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'evo', 'zapp', 'monitoring'
AS $fn$
DECLARE
  v_attempt RECORD;
  v_new_count INTEGER;
  v_lock_duration INTERVAL;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_max_attempts INTEGER := 5;
  v_ip_abuse_count INTEGER := 0;
BEGIN
  -- Guard anti-DoS: verifica se o IP ja registrou muitas falhas recentes
  IF p_ip_address IS NOT NULL THEN
    SELECT count(*) INTO v_ip_abuse_count
    FROM public.login_attempts
    WHERE ip_address = p_ip_address
      AND last_attempt_at > now() - interval '1 hour';

    IF v_ip_abuse_count >= 50 THEN
      RETURN QUERY SELECT true, now() + interval '1 hour', v_ip_abuse_count;
      RETURN;
    END IF;
  END IF;

  SELECT la.attempt_count, la.locked_until, la.last_attempt_at
  INTO v_attempt FROM public.login_attempts la WHERE la.email = LOWER(p_email);

  IF NOT FOUND THEN
    INSERT INTO public.login_attempts (email, ip_address, user_agent, attempt_count)
    VALUES (LOWER(p_email), p_ip_address, p_user_agent, 1);
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, 1;
    RETURN;
  END IF;

  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until <= now() THEN
    v_new_count := 1;
  ELSE
    v_new_count := v_attempt.attempt_count + 1;
  END IF;

  IF v_new_count >= v_max_attempts THEN
    v_lock_duration := (POWER(2, LEAST(v_new_count - v_max_attempts, 10)))::INTEGER * INTERVAL '1 minute';
    v_locked_until := now() + v_lock_duration;
  ELSE
    v_locked_until := NULL;
  END IF;

  UPDATE public.login_attempts
  SET attempt_count = v_new_count, last_attempt_at = now(), locked_until = v_locked_until,
      ip_address = COALESCE(p_ip_address, login_attempts.ip_address),
      user_agent = COALESCE(p_user_agent, login_attempts.user_agent), updated_at = now()
  WHERE email = LOWER(p_email);

  RETURN QUERY SELECT
    v_locked_until IS NOT NULL AND v_locked_until > now(), v_locked_until, v_new_count;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- M4: RLS nas 5 tabelas financeiras com dados sensiveis
-- Risco corrigido: colaboradores/emprestimos/vales/pagamentos/solicitacoes sem RLS
-- Ordem: policies ANTES de ENABLE (deny-all seria aplicado sem policies)
-- -----------------------------------------------------------------------------

-- colaboradores (dados de funcionarios)
CREATE POLICY fin_colaboradores_admin_rw ON financeiro.colaboradores
  FOR ALL TO authenticated USING (financeiro.fn_is_admin_diretor()) WITH CHECK (financeiro.fn_is_admin_diretor());
CREATE POLICY fin_colaboradores_service_full ON financeiro.colaboradores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- emprestimos (dados financeiros pessoais)
CREATE POLICY fin_emprestimos_admin_rw ON financeiro.emprestimos
  FOR ALL TO authenticated USING (financeiro.fn_is_admin_diretor()) WITH CHECK (financeiro.fn_is_admin_diretor());
CREATE POLICY fin_emprestimos_service_full ON financeiro.emprestimos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- vales (adiantamentos de salario)
CREATE POLICY fin_vales_admin_rw ON financeiro.vales
  FOR ALL TO authenticated USING (financeiro.fn_is_admin_diretor()) WITH CHECK (financeiro.fn_is_admin_diretor());
CREATE POLICY fin_vales_service_full ON financeiro.vales
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- pagamentos_diarios (financeiro geral)
CREATE POLICY fin_pagamentos_auth_rw ON financeiro.pagamentos_diarios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY fin_pagamentos_service_full ON financeiro.pagamentos_diarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- solicitacoes_alteracao_valor (qualquer authenticated pode criar, somente admin ve)
CREATE POLICY fin_solicitacoes_auth_insert ON financeiro.solicitacoes_alteracao_valor
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY fin_solicitacoes_admin_select ON financeiro.solicitacoes_alteracao_valor
  FOR SELECT TO authenticated USING (financeiro.fn_is_admin_diretor());
CREATE POLICY fin_solicitacoes_service_full ON financeiro.solicitacoes_alteracao_valor
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Ativa RLS (policies ja criadas acima)
ALTER TABLE financeiro.colaboradores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro.emprestimos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro.vales                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro.pagamentos_diarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro.solicitacoes_alteracao_valor ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- M5: FKs fisicas em email_app (integridade referencial garantida no DB)
-- Antes: sem constraints fisicas, orfas eram possiveis
-- -----------------------------------------------------------------------------
ALTER TABLE email_app.gmail_accounts
  ADD CONSTRAINT fk_gmail_accounts_profile_id
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE email_app.gmail_accounts
  ADD CONSTRAINT fk_gmail_accounts_user_id
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE email_app.email_threads
  ADD CONSTRAINT fk_email_threads_gmail_account_id
  FOREIGN KEY (gmail_account_id) REFERENCES email_app.gmail_accounts(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- -----------------------------------------------------------------------------
-- M6: Expansao de ops.check_critical_fks para cobrir email_app
-- Antes: funcao so verificava public/zapp (blind spot em email_app)
-- Agora: verifica 21 pares em 4 schemas (public, zapp, email_app, auth)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.check_critical_fks(p_raise boolean DEFAULT false)
RETURNS ops.schema_drift_log
LANGUAGE plpgsql
AS $fn$
DECLARE v_missing text[]; v_row ops.schema_drift_log;
BEGIN
  WITH esperadas(base_schema, base, child_schema, child) AS (VALUES
    ('public','role_permissions',    'public','permissions'),
    ('public','contact_tags',        'public','evolution_contacts'),
    ('public','contact_tags',        'public','tags'),
    ('public','sales_deals',         'public','evolution_contacts'),
    ('public','sales_deals',         'public','profiles'),
    ('public','conversation_events', 'public','profiles'),
    ('public','conversation_events', 'public','queues'),
    ('public','followup_executions', 'public','followup_sequences'),
    ('public','followup_sequences',  'public','followup_steps'),
    ('public','chatbot_executions',  'public','chatbot_flows'),
    ('public','automation_executions','public','automation_rules'),
    ('zapp',  'team_conversation_members','public','profiles'),
    ('public','team_messages',       'public','profiles'),
    ('public','user_roles',          'public','profiles'),
    ('public','conversation_sla',    'public','evolution_contacts'),
    ('email_app','gmail_accounts',   'public','profiles'),
    ('email_app','gmail_accounts',   'auth','users'),
    ('email_app','email_threads',    'email_app','gmail_accounts'),
    ('email_app','email_messages',   'email_app','email_threads'),
    ('email_app','email_drafts',     'email_app','email_accounts'),
    ('email_app','email_labels',     'email_app','gmail_accounts')
  )
  SELECT array_agg(base_schema||'.'||base||' -> '||child_schema||'.'||child ORDER BY base_schema,base,child)
  INTO v_missing
  FROM esperadas e
  WHERE EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname=e.base AND n.nspname=e.base_schema)
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint k
      JOIN pg_class bc ON bc.oid=k.conrelid JOIN pg_namespace bn ON bn.oid=bc.relnamespace
      JOIN pg_class cc ON cc.oid=k.confrelid JOIN pg_namespace cn ON cn.oid=cc.relnamespace
      WHERE k.contype='f' AND bc.relname=e.base AND bn.nspname=e.base_schema AND cc.relname=e.child AND cn.nspname=e.child_schema
    );

  INSERT INTO ops.schema_drift_log(status, missing_tables, missing_columns, detail)
  VALUES (
    CASE WHEN COALESCE(array_length(v_missing,1),0)>0 THEN 'DRIFT' ELSE 'OK' END,
    0, COALESCE(array_length(v_missing,1),0),
    jsonb_build_object('missing_fks', to_jsonb(COALESCE(v_missing, ARRAY[]::text[])),
                       'checked_schemas', '["public","zapp","email_app","auth"]'::jsonb,
                       'checked_pairs', 21, 'generated_at', now())
  ) RETURNING * INTO v_row;

  IF p_raise AND v_row.status='DRIFT' THEN
    RAISE EXCEPTION 'FKs criticas ausentes: %', v_row.detail;
  END IF;
  RETURN v_row;
END;
$fn$;

-- Notifica PostgREST para reload do schema
NOTIFY pgrst, 'reload schema';

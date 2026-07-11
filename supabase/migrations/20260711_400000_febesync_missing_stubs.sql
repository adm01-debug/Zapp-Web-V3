-- =============================================================================
-- 20260711_400000_febesync_missing_stubs.sql
-- =============================================================================
-- CONTEXTO:
--   Estas tabelas e funcoes EXISTEM na DB de producao mas nunca tiveram
--   CREATE no fluxo de migrations deste repo. Isso causava:
--     [B] check-fe-be-sync: tabelas orfas (email_drafts, email_signatures,
--         email_revalidation_jobs)
--     [A] check-fe-be-sync: RPCs orfas (rpc_email_archive_thread,
--         rpc_email_assign_thread, rpc_log_search_event)
--
-- SOLUCAO:
--   Stubs idempotentes (CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION)
--   que documentam o schema vigente e permitem `supabase db reset` limpo.
--
-- IDEMPOTENCIA: seguro re-aplicar em qualquer banco.
-- =============================================================================

-- [B] email_signatures
-- Schema inferido de: src/hooks/useEmailSignature.ts (interface EmailSignature)
CREATE TABLE IF NOT EXISTS public.email_signatures (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id  uuid        NOT NULL,
  name        text        NOT NULL,
  html_content text       NOT NULL DEFAULT '',
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_signatures_account_id
  ON public.email_signatures (account_id);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_email_signatures_default
  ON public.email_signatures (account_id)
  WHERE is_default = true;

-- [B] email_drafts
-- Schema inferido de: src/hooks/useEmailDraft.ts
CREATE TABLE IF NOT EXISTS public.email_drafts (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id      uuid        NOT NULL,
  thread_id_ref   uuid,
  to_emails       text[]      NOT NULL DEFAULT '{}',
  cc_emails       text[]      NOT NULL DEFAULT '{}',
  subject         text        NOT NULL DEFAULT '',
  body_html       text        NOT NULL DEFAULT '',
  last_saved_at   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_drafts_account_id
  ON public.email_drafts (account_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_thread_id
  ON public.email_drafts (thread_id_ref)
  WHERE thread_id_ref IS NOT NULL;

-- [B] email_revalidation_jobs
-- Schema inferido de: src/services/email/emailApi.ts (interface EmailRevalidationJob)
CREATE TABLE IF NOT EXISTS public.email_revalidation_jobs (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','running','success','failed')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  requested_by  uuid,
  result        jsonb
);

CREATE INDEX IF NOT EXISTS idx_email_revalidation_jobs_status
  ON public.email_revalidation_jobs (status);
CREATE INDEX IF NOT EXISTS idx_email_revalidation_jobs_requested_at
  ON public.email_revalidation_jobs (requested_at DESC);

-- [A] rpc_email_archive_thread
-- Assinatura: REVOKE...rpc_email_archive_thread(uuid, boolean)
CREATE OR REPLACE FUNCTION public.rpc_email_archive_thread(
  p_thread_id  uuid,
  p_archived   boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.email_threads
     SET is_archived = p_archived,
         updated_at  = now()
   WHERE id = p_thread_id
     AND auth.uid() IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_email_archive_thread(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_email_archive_thread(uuid, boolean) TO authenticated, service_role;

-- [A] rpc_email_assign_thread
-- Assinatura: REVOKE...rpc_email_assign_thread(uuid, text, text)
CREATE OR REPLACE FUNCTION public.rpc_email_assign_thread(
  p_thread_id    uuid,
  p_agent_id     text DEFAULT NULL,
  p_assigned_by  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.email_threads
     SET assigned_to = p_agent_id::uuid,
         updated_at  = now()
   WHERE id = p_thread_id
     AND auth.uid() IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_email_assign_thread(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_email_assign_thread(uuid, text, text) TO authenticated, service_role;

-- [A]+[C] rpc_log_search_event
-- Assinatura: ALTER FUNCTION public.rpc_log_search_event(text, text[], integer, boolean)
CREATE OR REPLACE FUNCTION public.rpc_log_search_event(
  p_query        text,
  p_results      text[]  DEFAULT '{}',
  p_result_count integer DEFAULT 0,
  p_found        boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.search_events (
    user_id, query, results, result_count, found, created_at
  )
  VALUES (
    auth.uid(), p_query, p_results, p_result_count, p_found, now()
  )
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table THEN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_log_search_event(text, text[], integer, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_log_search_event(text, text[], integer, boolean) TO authenticated, service_role;

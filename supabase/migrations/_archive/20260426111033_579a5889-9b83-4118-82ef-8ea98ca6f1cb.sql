-- ============================================================
-- MODELO DE DADOS — Auditoria, Reprocessamento e Recuperação
-- Lovable Cloud (FATOR X recebe peças complementares via ADR)
-- ============================================================

-- ------------------------------------------------------------
-- 1) conversation_threads
-- Snapshot operacional de cada conversa cross-canal.
-- Referencia evolution_* por id (sem FK — projeto externo).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_contact_id UUID NOT NULL,                  -- evolution_contacts.id (FATOR X)
  external_conversation_id UUID,                      -- evolution_conversations.id (FATOR X)
  remote_jid TEXT NOT NULL,
  instance_name TEXT NOT NULL DEFAULT 'wpp2',
  channel TEXT NOT NULL DEFAULT 'whatsapp',           -- whatsapp | instagram | telegram | webchat
  status TEXT NOT NULL DEFAULT 'open',                -- open | pending | resolved | archived
  last_event_at TIMESTAMPTZ,
  last_event_type TEXT,
  message_count BIGINT NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  health_score NUMERIC(4,2),                          -- 0..100, calculado por job
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_contact_id, instance_name, channel)
);

CREATE INDEX IF NOT EXISTS idx_threads_contact ON public.conversation_threads(external_contact_id);
CREATE INDEX IF NOT EXISTS idx_threads_status_lastev ON public.conversation_threads(status, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_instance_channel ON public.conversation_threads(instance_name, channel);

-- ------------------------------------------------------------
-- 2) conversation_participants
-- Histórico temporal de quem participou de cada thread.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL,                     -- agent | supervisor | contact | bot | system
  profile_id UUID,                                    -- profiles.id quando humano
  external_actor_id TEXT,                             -- jid/email/etc quando externo
  role TEXT NOT NULL DEFAULT 'observer',              -- owner | collaborator | observer | bot
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  reason_left TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participants_thread ON public.conversation_participants(thread_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_participants_profile ON public.conversation_participants(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_participants_active ON public.conversation_participants(thread_id) WHERE left_at IS NULL;

-- ------------------------------------------------------------
-- 3) provider_message_log
-- Log bruto e IMUTÁVEL de cada mensagem por provedor.
-- Idempotency key determinística garante exactly-once lógico.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_message_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,               -- sha256(provider+instance+msg_id+direction+ts)
  provider TEXT NOT NULL,                             -- evolution | cloud_api | fallback | webchat
  instance_name TEXT NOT NULL,
  external_message_id TEXT,                           -- ID do provedor (waMsgId, etc)
  direction TEXT NOT NULL,                            -- inbound | outbound
  remote_jid TEXT NOT NULL,
  thread_id UUID REFERENCES public.conversation_threads(id) ON DELETE SET NULL,
  external_contact_id UUID,                           -- evolution_contacts.id
  payload JSONB NOT NULL,                             -- payload bruto recebido/enviado
  payload_hash TEXT NOT NULL,                         -- sha256 do payload (audit/dedup secundário)
  delivery_status TEXT NOT NULL DEFAULT 'received',   -- received | persisted | routed | sent | delivered | read | failed
  http_status INTEGER,
  error_code TEXT,
  error_message TEXT,
  trace_id TEXT,                                      -- correlação OpenTelemetry
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  persisted_at TIMESTAMPTZ,
  routed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pml_jid_received ON public.provider_message_log(remote_jid, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_pml_thread ON public.provider_message_log(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pml_status ON public.provider_message_log(delivery_status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_pml_provider_instance ON public.provider_message_log(provider, instance_name, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_pml_trace ON public.provider_message_log(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pml_failed ON public.provider_message_log(received_at DESC) WHERE delivery_status = 'failed';

-- Imutabilidade: bloquear UPDATE em colunas críticas após criação
CREATE OR REPLACE FUNCTION public.fn_pml_protect_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key)
     OR (OLD.payload IS DISTINCT FROM NEW.payload)
     OR (OLD.payload_hash IS DISTINCT FROM NEW.payload_hash)
     OR (OLD.provider IS DISTINCT FROM NEW.provider)
     OR (OLD.external_message_id IS DISTINCT FROM NEW.external_message_id)
     OR (OLD.received_at IS DISTINCT FROM NEW.received_at) THEN
    RAISE EXCEPTION 'provider_message_log: immutable columns cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pml_immutable ON public.provider_message_log;
CREATE TRIGGER trg_pml_immutable
BEFORE UPDATE ON public.provider_message_log
FOR EACH ROW EXECUTE FUNCTION public.fn_pml_protect_immutable();

-- ------------------------------------------------------------
-- 4) reprocess_jobs
-- Fila de reprocessamento com idempotency forte e auditoria.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reprocess_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,               -- sha256(target_kind+target_id+action+requester)
  target_kind TEXT NOT NULL,                          -- provider_message_log | failed_message | thread
  target_id UUID NOT NULL,
  action TEXT NOT NULL,                               -- replay | reroute | fan_out | recover_state
  status TEXT NOT NULL DEFAULT 'queued',              -- queued | running | succeeded | failed | abandoned
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  requested_by UUID REFERENCES auth.users(id),
  reason TEXT,
  result JSONB,
  error_message TEXT,
  trace_id TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rj_status_sched ON public.reprocess_jobs(status, scheduled_at) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_rj_target ON public.reprocess_jobs(target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_rj_requested_by ON public.reprocess_jobs(requested_by, created_at DESC);

-- ------------------------------------------------------------
-- 5) outbox_events
-- Pattern transacional: persistência + side-effects no mesmo COMMIT.
-- Worker lê com SKIP LOCKED e dispara fanout (AI, SLA, CRM, webhooks).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outbox_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  aggregate_type TEXT NOT NULL,                       -- thread | message | participant | assignment
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,                           -- message.received | thread.assigned | sla.warning ...
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',             -- pending | processing | dispatched | failed | abandoned
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  last_error TEXT,
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON public.outbox_events(next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON public.outbox_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_event_type ON public.outbox_events(event_type, created_at DESC);

-- ------------------------------------------------------------
-- 6) Estender conversation_events com correlação fim-a-fim
-- (tabela já existe; só adiciona colunas se faltarem)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='conversation_events') THEN
    BEGIN
      ALTER TABLE public.conversation_events
        ADD COLUMN IF NOT EXISTS trace_id TEXT,
        ADD COLUMN IF NOT EXISTS provider_message_log_id UUID,
        ADD COLUMN IF NOT EXISTS thread_id UUID,
        ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
      CREATE INDEX IF NOT EXISTS idx_conv_events_trace ON public.conversation_events(trace_id) WHERE trace_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_conv_events_thread ON public.conversation_events(thread_id) WHERE thread_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_conv_events_pml ON public.conversation_events(provider_message_log_id) WHERE provider_message_log_id IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'conversation_events alter skipped: %', SQLERRM;
    END;
  END IF;
END $$;

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
CREATE TRIGGER trg_threads_updated BEFORE UPDATE ON public.conversation_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_rj_updated BEFORE UPDATE ON public.reprocess_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_outbox_updated BEFORE UPDATE ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reprocess_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

-- conversation_threads ---------------------------------------
CREATE POLICY "threads_select_admin_supervisor"
ON public.conversation_threads FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "threads_select_participant"
ON public.conversation_threads FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE cp.thread_id = conversation_threads.id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "threads_admin_write"
ON public.conversation_threads FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- conversation_participants ----------------------------------
CREATE POLICY "participants_select_admin_supervisor"
ON public.conversation_participants FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "participants_select_self"
ON public.conversation_participants FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = conversation_participants.profile_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "participants_admin_write"
ON public.conversation_participants FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- provider_message_log (somente admin/supervisor leem) -------
CREATE POLICY "pml_select_admin_supervisor"
ON public.provider_message_log FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "pml_admin_insert"
ON public.provider_message_log FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "pml_admin_update"
ON public.provider_message_log FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- reprocess_jobs (somente admin) -----------------------------
CREATE POLICY "rj_select_admin_supervisor"
ON public.reprocess_jobs FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "rj_admin_write"
ON public.reprocess_jobs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- outbox_events (somente admin lê; só sistema escreve) -------
CREATE POLICY "outbox_select_admin"
ON public.outbox_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "outbox_admin_write"
ON public.outbox_events FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- RPCs de apoio
-- ============================================================

-- Registrar entrada no provider_message_log (SECURITY DEFINER → bypassa RLS p/ webhook)
CREATE OR REPLACE FUNCTION public.rpc_log_provider_message(
  p_idempotency_key TEXT,
  p_provider TEXT,
  p_instance_name TEXT,
  p_external_message_id TEXT,
  p_direction TEXT,
  p_remote_jid TEXT,
  p_external_contact_id UUID,
  p_payload JSONB,
  p_trace_id TEXT DEFAULT NULL,
  p_thread_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_hash TEXT;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'idempotency_key required';
  END IF;

  v_hash := encode(digest(p_payload::text, 'sha256'), 'hex');

  INSERT INTO public.provider_message_log (
    idempotency_key, provider, instance_name, external_message_id,
    direction, remote_jid, external_contact_id, payload, payload_hash,
    trace_id, thread_id
  )
  VALUES (
    p_idempotency_key, p_provider, p_instance_name, p_external_message_id,
    p_direction, p_remote_jid, p_external_contact_id, p_payload, v_hash,
    p_trace_id, p_thread_id
  )
  ON CONFLICT (idempotency_key) DO UPDATE
    SET metadata = provider_message_log.metadata || jsonb_build_object(
      'duplicate_attempts',
      COALESCE((provider_message_log.metadata->>'duplicate_attempts')::int, 0) + 1,
      'last_duplicate_at', now()
    )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Enfileirar reprocessamento com idempotência forte
CREATE OR REPLACE FUNCTION public.rpc_enqueue_reprocess(
  p_target_kind TEXT,
  p_target_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_key := encode(digest(
    p_target_kind || ':' || p_target_id::text || ':' || p_action || ':' ||
    COALESCE(auth.uid()::text, 'system') || ':' ||
    to_char(date_trunc('hour', now()), 'YYYY-MM-DD HH24'),
    'sha256'
  ), 'hex');

  INSERT INTO public.reprocess_jobs (
    idempotency_key, target_kind, target_id, action, requested_by, reason
  )
  VALUES (v_key, p_target_kind, p_target_id, p_action, auth.uid(), p_reason)
  ON CONFLICT (idempotency_key) DO UPDATE
    SET reason = COALESCE(EXCLUDED.reason, reprocess_jobs.reason),
        updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'reprocess_enqueued',
    'reprocess_jobs',
    v_id::text,
    jsonb_build_object(
      'target_kind', p_target_kind,
      'target_id', p_target_id,
      'action', p_action,
      'reason', p_reason
    )
  );

  RETURN v_id;
END;
$$;

-- Publicar evento no outbox (chamado dentro de transação principal pelo backend)
CREATE OR REPLACE FUNCTION public.rpc_publish_outbox(
  p_aggregate_type TEXT,
  p_aggregate_id UUID,
  p_event_type TEXT,
  p_payload JSONB,
  p_idempotency_key TEXT DEFAULT NULL,
  p_trace_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_id UUID;
BEGIN
  v_key := COALESCE(
    p_idempotency_key,
    encode(digest(
      p_aggregate_type || ':' || p_aggregate_id::text || ':' || p_event_type || ':' ||
      encode(digest(p_payload::text, 'sha256'), 'hex'),
      'sha256'
    ), 'hex')
  );

  INSERT INTO public.outbox_events (
    aggregate_type, aggregate_id, event_type, payload, idempotency_key, trace_id
  )
  VALUES (p_aggregate_type, p_aggregate_id, p_event_type, p_payload, v_key, p_trace_id)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
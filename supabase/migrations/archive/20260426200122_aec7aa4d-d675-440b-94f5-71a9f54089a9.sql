-- Enum dos tipos de gatilho
DO $$ BEGIN
  CREATE TYPE public.automation_trigger_type AS ENUM (
    'first_response_pending',
    'inactivity',
    'tag_applied',
    'tag_removed',
    'keyword_match'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.automation_execution_status AS ENUM (
    'pending',
    'accepted',
    'dismissed',
    'executed',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tabela de regras
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trigger_type public.automation_trigger_type NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- ações: { suggest_reply: bool, auto_send: bool, apply_tags: [..], reassign_queue: uuid|null, reassign_user: uuid|null, ai_prompt: text|null, template: text|null }
  actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 100,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_active_type
  ON public.automation_rules(is_active, trigger_type, priority);

-- Tabela de execuções
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  remote_jid TEXT NOT NULL,
  instance_name TEXT NOT NULL DEFAULT 'wpp2',
  assigned_to UUID,
  status public.automation_execution_status NOT NULL DEFAULT 'pending',
  trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggestion_text TEXT,
  applied_tags TEXT[],
  reassigned_to UUID,
  error_message TEXT,
  acted_by UUID,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_executions_jid_status
  ON public.automation_executions(remote_jid, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_executions_rule_recent
  ON public.automation_executions(rule_id, created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_automation_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automation_rules_updated_at ON public.automation_rules;
CREATE TRIGGER trg_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_automation_rules_updated_at();

-- RLS
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rules_view_all_authenticated" ON public.automation_rules;
CREATE POLICY "rules_view_all_authenticated"
  ON public.automation_rules FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rules_admin_manage" ON public.automation_rules;
CREATE POLICY "rules_admin_manage"
  ON public.automation_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

DROP POLICY IF EXISTS "executions_view_scoped" ON public.automation_executions;
CREATE POLICY "executions_view_scoped"
  ON public.automation_executions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'manager')
    OR assigned_to = auth.uid()
  );

DROP POLICY IF EXISTS "executions_insert_authenticated" ON public.automation_executions;
CREATE POLICY "executions_insert_authenticated"
  ON public.automation_executions FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "executions_update_scoped" ON public.automation_executions;
CREATE POLICY "executions_update_scoped"
  ON public.automation_executions FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'supervisor')
    OR assigned_to = auth.uid()
  );

DROP POLICY IF EXISTS "executions_admin_delete" ON public.automation_executions;
CREATE POLICY "executions_admin_delete"
  ON public.automation_executions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- RPC: verificar cooldown e registrar nova execução pendente
CREATE OR REPLACE FUNCTION public.rpc_register_automation_execution(
  p_rule_id UUID,
  p_remote_jid TEXT,
  p_instance_name TEXT,
  p_assigned_to UUID,
  p_trigger_payload JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cooldown INTEGER;
  v_recent_count INTEGER;
  v_id UUID;
BEGIN
  SELECT cooldown_seconds INTO v_cooldown
  FROM public.automation_rules WHERE id = p_rule_id AND is_active = true;
  IF v_cooldown IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.automation_executions
  WHERE rule_id = p_rule_id
    AND remote_jid = p_remote_jid
    AND created_at > now() - make_interval(secs => v_cooldown);

  IF v_recent_count > 0 THEN RETURN NULL; END IF;

  INSERT INTO public.automation_executions (
    rule_id, remote_jid, instance_name, assigned_to, trigger_payload, status
  ) VALUES (
    p_rule_id, p_remote_jid, p_instance_name, p_assigned_to, p_trigger_payload, 'pending'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
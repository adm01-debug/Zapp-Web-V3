
ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_by uuid,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS max_queue_size integer,
  ADD COLUMN IF NOT EXISTS max_wait_seconds integer,
  ADD COLUMN IF NOT EXISTS overflow_queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS distribution_algorithm text NOT NULL DEFAULT 'least_busy',
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_concurrent_per_agent integer,
  ADD COLUMN IF NOT EXISTS max_per_queue_per_agent integer;

DO $$ BEGIN
  ALTER TABLE public.queues
    ADD CONSTRAINT queues_status_check
    CHECK (status IN ('active','paused','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.queues
    ADD CONSTRAINT queues_distribution_algorithm_check
    CHECK (distribution_algorithm IN ('round_robin','least_busy','longest_idle','manual_pull'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_queues_status ON public.queues(status);
CREATE INDEX IF NOT EXISTS idx_queues_department ON public.queues(department_id) WHERE department_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.channel_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.service_channels(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (channel_id, queue_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_queues_channel ON public.channel_queues(channel_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_channel_queues_queue ON public.channel_queues(queue_id) WHERE is_active = true;

ALTER TABLE public.channel_queues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view channel_queues" ON public.channel_queues;
CREATE POLICY "view channel_queues" ON public.channel_queues
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "manage channel_queues" ON public.channel_queues;
CREATE POLICY "manage channel_queues" ON public.channel_queues
  FOR ALL TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));

DROP TRIGGER IF EXISTS update_channel_queues_updated_at ON public.channel_queues;
CREATE TRIGGER update_channel_queues_updated_at
  BEFORE UPDATE ON public.channel_queues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_queues;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pausar fila
CREATE OR REPLACE FUNCTION public.rpc_pause_queue(p_queue_id uuid, p_reason text DEFAULT NULL)
RETURNS public.queues
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.queues;
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.queues
     SET status='paused', paused_at=now(), paused_by=auth.uid(), paused_reason=p_reason, is_active=false
   WHERE id=p_queue_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'queue not found'; END IF;
  RETURN v_row;
END $$;

-- Retomar fila
CREATE OR REPLACE FUNCTION public.rpc_resume_queue(p_queue_id uuid)
RETURNS public.queues
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.queues;
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.queues
     SET status='active', paused_at=NULL, paused_by=NULL, paused_reason=NULL, is_active=true
   WHERE id=p_queue_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'queue not found'; END IF;
  RETURN v_row;
END $$;

-- Vincular
CREATE OR REPLACE FUNCTION public.rpc_link_channel_queue(
  p_channel_id uuid, p_queue_id uuid,
  p_priority integer DEFAULT 0, p_is_active boolean DEFAULT true
) RETURNS public.channel_queues
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.channel_queues;
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.channel_queues(channel_id, queue_id, priority, is_active, created_by)
  VALUES (p_channel_id, p_queue_id, COALESCE(p_priority,0), COALESCE(p_is_active,true), auth.uid())
  ON CONFLICT (channel_id, queue_id) DO UPDATE
    SET priority=EXCLUDED.priority, is_active=EXCLUDED.is_active, updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- Desvincular
CREATE OR REPLACE FUNCTION public.rpc_unlink_channel_queue(p_channel_id uuid, p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.channel_queues WHERE channel_id=p_channel_id AND queue_id=p_queue_id;
  RETURN FOUND;
END $$;

-- Listar filas de um canal
CREATE OR REPLACE FUNCTION public.rpc_list_channel_queues(p_channel_id uuid)
RETURNS TABLE (
  queue_id uuid, name text, status text, priority integer, is_default boolean, is_active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT q.id, q.name, q.status,
         COALESCE(cq.priority, 0),
         (sc.default_queue_id = q.id),
         COALESCE(cq.is_active, true)
  FROM public.service_channels sc
  LEFT JOIN public.channel_queues cq ON cq.channel_id = sc.id
  LEFT JOIN public.queues q
         ON q.id = cq.queue_id OR q.id = sc.default_queue_id
  WHERE sc.id = p_channel_id AND q.id IS NOT NULL
  ORDER BY (sc.default_queue_id = q.id) DESC, COALESCE(cq.priority,0) DESC, q.name;
$$;

-- Agentes elegíveis (por departamento) + carga atual
CREATE OR REPLACE FUNCTION public.rpc_list_eligible_agents(p_queue_id uuid)
RETURNS TABLE (
  user_id uuid, display_name text, department_id uuid,
  max_chats integer, active_chats bigint, is_active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (SELECT department_id, max_per_queue_per_agent FROM public.queues WHERE id = p_queue_id)
  SELECT p.user_id,
         COALESCE(p.name, p.email),
         p.department_id,
         COALESCE(p.max_chats, 5),
         (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = p.user_id),
         COALESCE(p.is_active, true)
  FROM public.profiles p, q
  WHERE (q.department_id IS NULL OR p.department_id = q.department_id)
    AND COALESCE(p.is_active, true) = true
    AND p.role IN ('agent','supervisor','admin');
$$;

-- Próximo agente
CREATE OR REPLACE FUNCTION public.rpc_pick_next_agent(p_queue_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_algo text; v_pick uuid;
BEGIN
  SELECT distribution_algorithm INTO v_algo
    FROM public.queues WHERE id = p_queue_id AND status = 'active';
  IF v_algo IS NULL OR v_algo = 'manual_pull' THEN RETURN NULL; END IF;

  WITH cand AS (
    SELECT user_id, active_chats, max_chats
      FROM public.rpc_list_eligible_agents(p_queue_id)
     WHERE active_chats < max_chats
  )
  SELECT user_id INTO v_pick FROM cand
   ORDER BY
     CASE WHEN v_algo IN ('least_busy','round_robin','longest_idle') THEN active_chats END ASC NULLS LAST,
     random()
   LIMIT 1;
  RETURN v_pick;
END $$;

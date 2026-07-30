-- QUEUES: substituir SELECT permissivo
DROP POLICY IF EXISTS "Authenticated users can view queues" ON public.queues;

CREATE POLICY "queues_select_scoped"
ON public.queues
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_supervisor(auth.uid())
  OR (
    department_id IS NOT NULL
    AND department_id = public.get_user_department(auth.uid())
  )
);

-- CHANNEL_QUEUES: substituir SELECT permissivo
DROP POLICY IF EXISTS "view channel_queues" ON public.channel_queues;

CREATE POLICY "channel_queues_select_scoped"
ON public.channel_queues
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_supervisor(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.queues q
    WHERE q.id = channel_queues.queue_id
      AND q.department_id IS NOT NULL
      AND q.department_id = public.get_user_department(auth.uid())
  )
);
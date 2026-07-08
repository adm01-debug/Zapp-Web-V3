ALTER TABLE public.team_conversations
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata      jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_team_conversations_department_id
  ON public.team_conversations(department_id)
  WHERE department_id IS NOT NULL;

-- Único por departamento (só quando type='department')
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_conversations_department
  ON public.team_conversations(department_id)
  WHERE type = 'department' AND department_id IS NOT NULL;